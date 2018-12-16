import Logger from '../Logger';
import Database from '../db/Database';
import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType, CurrencyInfo } from '../proto/boltzrpc_pb';
import PairRepository from './PairRepository';
import { PairInstance, PairFactory } from '../consts/Database';
import { stringify } from '../Utils';
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

class Service {
  private pairRepository: PairRepository;

  private pairs: Pair[] = [];

  constructor(private logger: Logger, db: Database, private boltz: BoltzClient) {
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

    dbPairs.forEach((pair) => {
      try {
        verifyBackendSupport(pair.base);
        verifyBackendSupport(pair.quote);

        // TODO: get rate
        this.pairs.push({
          // The values have to be set manually to avoid "TypeError: Converting circular structure to JSON" errors
          id: pair.id,
          base: pair.base,
          quote: pair.quote,
          rate: 0.008,
        });
      } catch (error) {
        this.logger.warn(`Could not initialise pair ${pair.id}: ${error.message}`);
      }
    });

    this.logger.verbose(`Initialised ${this.pairs.length} pairs: ${stringify(this.pairs)}`);
  }

  // TODO: allow filters
  /**
   * Gets all supported pairs and their conversion rates
   */
  public getPairs = () => {
    return this.pairs;
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
  public createSwap = (pairId: string, orderSide: OrderSide, invoice: string, refundPublicKey: string) => {
    return this.boltz.createSwap(pairId, orderSide, invoice, refundPublicKey, OutputType.COMPATIBILITY);
  }
}

export default Service;
export { PairConfig };
