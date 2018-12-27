import { EventEmitter } from 'events';
import uuidv4 from 'uuid/v4';
import Logger from '../Logger';
import Database from '../db/Database';
import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType, CurrencyInfo } from '../proto/boltzrpc_pb';
import PairRepository from './PairRepository';
import RateProvider from '../rates/RateProvider';
import { PairInstance, PairFactory } from '../consts/Database';
import { splitPairId, stringify, mapToArray } from '../Utils';
import Errors from './Errors';

type PairConfig = {
  base: string;
  quote: string;
};

type Pair = {
  id: string;
  base: string;
  quote: string;

  rate: number;
};

type PendingSwap = {
  invoice: string;
  address: string;
};

interface Service {
  on(event: 'swap.update', listener: (id: string, message: string) => void): this;
  emit(event: 'swap.update', id: string, message: string): boolean;
}

// TODO: update rates of pairs regularly
class Service extends EventEmitter {
  // A map between the ids and details of all pending swaps
  private pendingSwaps = new Map<string, PendingSwap>();

  private rateProvider: RateProvider;
  private pairRepository: PairRepository;

  private pairs = new Map<string, Pair>();

  // This object is needed because a stringifyied Map is an empty object
  // tslint:disable-next-line:no-null-keyword
  private pairsObject = {};

  constructor(private logger: Logger, db: Database, private boltz: BoltzClient) {
    super();

    this.rateProvider = new RateProvider(this.logger);
    this.pairRepository = new PairRepository(db.models);
  }

  public init = async (pairs: PairConfig[]) => {
    // Update the pairs in the database with the ones in the config
    let dbPairs = await this.pairRepository.getPairs();

    type PairArray = PairConfig[] | PairInstance[];

    const comparePairArrays = (array: PairArray, compare: PairArray, callback: Function) => {
      array.forEach((pair) => {
        let inCompare = false;

        compare.forEach((comaprePair) => {
          if (pair.base === comaprePair.base && pair.quote === comaprePair.quote) {
            inCompare = true;
          }
        });

        if (!inCompare) {
          callback(pair);
        }
      });
    };

    const promises: Promise<any>[] = [];

    comparePairArrays(pairs, dbPairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.addPair(pair));
      this.logger.debug(`Adding pair to database: ${stringify(pair)}`);
    });

    comparePairArrays(dbPairs, pairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.removePair(pair));
      this.logger.debug(`Removing pair from database: ${stringify(pair)}`);
    });

    await Promise.all(promises);

    if (promises.length !== 0) {
      dbPairs = await this.pairRepository.getPairs();
    }

    this.logger.verbose('Updated pairs in database with config');

    // Make sure all pairs are supported by the backend and init the pairs array
    const { chainsList } = await this.boltz.getInfo();
    const chainMap = new Map<string, CurrencyInfo.AsObject>();

    chainsList.forEach((chain) => {
      chainMap.set(chain.symbol, chain);
    });

    const verifyBackendSupport = (symbol: string) => {
      if (!chainMap.get(symbol)) {
        throw Errors.CURRENCY_NOT_SUPPORTED_BY_BACKEND(symbol);
      }
    };

    const rates = await this.rateProvider.getRates(dbPairs);

    dbPairs.forEach((pair) => {
      try {
        verifyBackendSupport(pair.base);
        verifyBackendSupport(pair.quote);

        const rate = rates.get(pair.id)!;

        this.pairs.set(pair.id, {
          // The values have to be set manually to avoid "TypeError: Converting circular structure to JSON" errors
          rate,
          id: pair.id,
          base: pair.base,
          quote: pair.quote,
        });

        this.pairsObject[pair.id] = rate;
      } catch (error) {
        this.logger.warn(`Could not initialise pair ${pair.id}: ${error.message}`);
      }
    });

    this.logger.verbose(`Initialised ${this.pairs.size} pairs: ${stringify(mapToArray(this.pairs))}`);

    // Listen to events of the Boltz client
    this.boltz.on('transaction.confirmed', (transactionHash: string, outputAddress: string) => {
      this.pendingSwaps.forEach((swap, id) => {
        if (swap.address === outputAddress) {
          this.emit('swap.update', id, `Transaction confirmed: ${transactionHash}`);
        }
      });
    });

    this.boltz.on('invoice.paid', (invoice: string) => {
      this.pendingSwaps.forEach((swap, id) => {
        if (swap.invoice === invoice) {
          this.emit('swap.update', id, `Invoice paid: ${invoice}`);
        }
      });
    });
  }

  // TODO: allow filters
  /**
   * Gets all supported pairs and their conversion rates
   */
  public getPairs = () => {
    return this.pairsObject;
  }

  /**
   * Gets a hex encoded transaction from a transaction hash on the specified network
   */
  public getTransaction = (currency: string, transactionHash: string) => {
    return this.boltz.getTransaction(currency, transactionHash);
  }

  /**
   * Broadcasts a hex encoded transaction on the specified network
   */
  public broadcastTransaction = (currency: string, transactionHex: string) => {
    return this.boltz.broadcastTransaction(currency, transactionHex);
  }

  /**
   * Creates a new Swap from the chain to Lightning
   */
  public createSwap = async (pairId: string, orderSide: OrderSide, invoice: string, refundPublicKey: string) => {
    const { base, quote } = splitPairId(pairId);

    const pair = this.pairs.get(pairId);

    if (pair === undefined) {
      throw Errors.PAIR_NOT_SUPPORTED(pairId);
    }

    const swapResponse = await this.boltz.createSwap(base, quote, orderSide, pair.rate, invoice, refundPublicKey, OutputType.COMPATIBILITY);
    await this.boltz.listenOnAddress(this.getChainCurrency(orderSide, base, quote), swapResponse.address);

    const id = uuidv4();

    this.pendingSwaps.set(id, {
      invoice,
      address: swapResponse.address,
    });

    return {
      id,
      ...swapResponse,
    };
  }

  /**
   * Get the currency on which the onchain transaction of a swap happens
   */
  private getChainCurrency = (orderSide: OrderSide, base: string, quote: string) => {
    if (orderSide === OrderSide.BUY) {
      return quote;
    } else {
      return base;
    }
  }
}

export default Service;
export { PairConfig };
