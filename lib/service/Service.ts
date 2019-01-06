import { EventEmitter } from 'events';
import Logger from '../Logger';
import Database from '../db/Database';
import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType, CurrencyInfo } from '../proto/boltzrpc_pb';
import PairRepository from './PairRepository';
import RateProvider from '../rates/RateProvider';
import { PairInstance, PairFactory } from '../consts/Database';
import { splitPairId, stringify, generateId, mapToObject } from '../Utils';
import Errors from './Errors';
import { encodeBip21 } from './PaymentRequestUtils';

type PairConfig = {
  base: string;
  quote: string;
};

type Pair = {
  id: string;
  base: string;
  quote: string;
};

type PendingSwap = {
  invoice: string;
  address: string;
};

interface Service {
  on(event: 'swap.update', listener: (id: string, message: string) => void): this;
  emit(event: 'swap.update', id: string, message: string): boolean;
}

class Service extends EventEmitter {
  // A map between the ids and details of all pending swaps
  private pendingSwaps = new Map<string, PendingSwap>();

  private rateProvider: RateProvider;
  private pairRepository: PairRepository;

  private pairs = new Map<string, Pair>();

  constructor(private logger: Logger, db: Database, private boltz: BoltzClient, rateInterval: number) {
    super();

    this.rateProvider = new RateProvider(this.logger, rateInterval);
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

    await this.rateProvider.init(dbPairs);

    dbPairs.forEach((pair) => {
      try {
        verifyBackendSupport(pair.base);
        verifyBackendSupport(pair.quote);

        this.pairs.set(pair.id, {
          // The values have to be set manually to avoid "TypeError: Converting circular structure to JSON" errors
          id: pair.id,
          base: pair.base,
          quote: pair.quote,
        });
      } catch (error) {
        this.logger.warn(`Could not initialise pair ${pair.id}: ${error.message}`);
      }
    });

    this.logger.verbose(`Initialised ${this.pairs.size} pairs: ${stringify(mapToObject(this.pairs))}`);

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

  /**
   * Gets all supported pairs and their conversion rates
   */
  public getPairs = () => {
    return mapToObject(this.rateProvider.rates);
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
  public createSwap = async (pairId: string, orderSide: string, invoice: string, refundPublicKey: string) => {
    const { base, quote } = splitPairId(pairId);

    const pair = this.pairs.get(pairId);
    const rate = this.rateProvider.rates.get(pairId);

    if (!pair || !rate) {
      throw Errors.PAIR_NOT_SUPPORTED(pairId);
    }

    const side = this.getOrderSide(orderSide);

    const chainCurrency = this.getChainCurrency(side, base, quote);
    const lightningCurrency = this.getLightningCurrency(side, base, quote);

    const swapResponse = await this.boltz.createSwap(base, quote, side, rate, invoice, refundPublicKey, OutputType.COMPATIBILITY);
    await this.boltz.listenOnAddress(chainCurrency, swapResponse.address);

    const id = generateId(6);

    this.pendingSwaps.set(id, {
      invoice,
      address: swapResponse.address,
    });

    return {
      id,
      bip21: encodeBip21(
        chainCurrency,
        swapResponse.address,
        swapResponse.expectedAmount,
        `Submarine Swap to ${lightningCurrency}`,
      ),
      ...swapResponse,
    };
  }

  /**
   * Gets the currency on which the onchain transaction of a swap happens
   */
  private getChainCurrency = (orderSide: OrderSide, base: string, quote: string) => {
    if (orderSide === OrderSide.BUY) {
      return quote;
    } else {
      return base;
    }
  }

  /**
   * Get the currency on which the Lightning transaction happens
   */
  private getLightningCurrency = (orderSide: OrderSide, base: string, quote: string) => {
    return this.getChainCurrency(orderSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY, base, quote);
  }

  /**
   * Gets the corresponding OrderSide enum of a string
   */
  private getOrderSide = (orderSide: string) => {
    switch (orderSide.toLowerCase()) {
      case 'buy': return OrderSide.BUY;
      case 'sell': return OrderSide.SELL;

      default: throw Errors.ORDER_SIDE_NOT_SUPPORTED(orderSide);
    }
  }
}

export default Service;
export { PairConfig };
