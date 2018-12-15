import Logger from '../Logger';
import Database from '../db/Database';
import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType } from '../proto/boltzrpc_pb';
import { PairConfig } from '../Config';
import PairRepository from './PairRepository';
import { PairInstance, PairFactory } from '../consts/Database';
import { stringify } from '../Utils';

class Service {
  private pairRepository: PairRepository;

  private pairs: PairInstance[] = [];

  constructor(private logger: Logger, db: Database, private boltz: BoltzClient) {
    this.pairRepository = new PairRepository(db.models);
  }

  public init = async (pairs: PairConfig[]) => {
    // Update the pairs in the database with the ones in the config
    this.pairs = await this.pairRepository.getPairs();

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

    comparePairArrays(pairs, this.pairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.addPair(pair));
      this.logger.debug(`Adding pair to database: ${stringify(pair)}`);
    });

    comparePairArrays(this.pairs, pairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.removePair(pair));
      this.logger.debug(`Removing pair from database: ${stringify(pair)}`);
    });

    await Promise.all(promises);

    if (promises.length !== 0) {
      this.pairs = await this.pairRepository.getPairs();
    }

    this.logger.verbose('Updated pairs in database with config');
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
