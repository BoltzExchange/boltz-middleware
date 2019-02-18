import bolt11 from '@boltz/bolt11';
import { EventEmitter } from 'events';
import Errors from './Errors';
import Logger from '../Logger';
import Database from '../db/Database';
import PairRepository from './PairRepository';
import BoltzClient from '../boltz/BoltzClient';
import RateProvider from '../rates/RateProvider';
import { encodeBip21 } from './PaymentRequestUtils';
import { PairInstance, PairFactory } from '../consts/Database';
import { CurrencyConfig } from '../notifications/NotificationProvider';
import { OrderSide, OutputType, CurrencyInfo } from '../proto/boltzrpc_pb';
import { splitPairId, stringify, generateId, mapToObject, satoshisToWholeCoins } from '../Utils';

type PairConfig = {
  base: string;
  quote: string;

  // If there is a hardcoded rate the CryptoCompare API will not be queried
  rate?: number;
};

type Pair = {
  id: string;
  base: string;
  quote: string;
};

type PendingSwap = {
  invoice: string;
  lockupAddress: string;
};

type PendingReverseSwap = {
  invoice: string;
  transactionHash: string;
};

interface Service {
  on(event: 'swap.update', listener: (id: string, message: object) => void): this;
  emit(event: 'swap.update', id: string, message: object): boolean;
}

class Service extends EventEmitter {
  // A map between the ids and details of all pending swaps
  private pendingSwaps = new Map<string, PendingSwap>();

  // A map between the ids and detials of all pending reverse swaps
  private pendingReverseSwaps = new Map<string, PendingReverseSwap>();

  private rateProvider: RateProvider;
  private pairRepository: PairRepository;

  private pairs = new Map<string, Pair>();

  constructor(
    private logger: Logger,
    private boltz: BoltzClient,
    db: Database,
    rateInterval: number,
    currencies: CurrencyConfig[]) {

    super();

    this.rateProvider = new RateProvider(this.logger, rateInterval, currencies);
    this.pairRepository = new PairRepository(db.models);
  }

  public init = async (pairs: PairConfig[]) => {
    // Update the pairs in the database with the ones in the config
    let dbPairs = await this.pairRepository.getPairs();

    type PairArray = PairConfig[] | PairInstance[];

    const isUndefinedOrNull = (value: any) => value === undefined || value === null;

    const comparePairArrays = (array: PairArray, compare: PairArray, callback: Function) => {
      array.forEach((pair) => {
        let inCompare = false;

        compare.forEach((comparePair) => {
          if (pair.base === comparePair.base &&
            pair.quote === comparePair.quote) {

            // If the rate is equal in config and database or not defined in the config
            // and null in the database the database entry doesn't have to be updated
            if (pair.rate === comparePair.rate ||
              (isUndefinedOrNull(pair.rate)) && isUndefinedOrNull(comparePair.rate)) {

              inCompare = true;
            }
          }
        });

        if (!inCompare) {
          callback(pair);
        }
      });
    };

    const promises: Promise<any>[] = [];

    comparePairArrays(dbPairs, pairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.removePair(pair));
      this.logger.debug(`Removing pair from database: ${stringify(pair)}`);
    });

    comparePairArrays(pairs, dbPairs, (pair: PairFactory) => {
      promises.push(this.pairRepository.addPair(pair));
      this.logger.debug(`Adding pair to database: ${stringify(pair)}`);
    });

    await Promise.all(promises);

    if (promises.length !== 0) {
      dbPairs = await this.pairRepository.getPairs();
    }

    this.logger.verbose('Updated pairs in database with config');

    // Make sure all pairs are supported by the backend and init the pairs array
    const { chainsMap } = await this.boltz.getInfo();
    const chainMap = new Map<string, CurrencyInfo.AsObject>();

    chainsMap.forEach(([symbol, chain]) => {
      chainMap.set(symbol, chain);
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

    this.logger.verbose(`Initialised ${this.pairs.size} pairs: ${stringify(Array.from(this.pairs.keys()))}`);

    const emitTransactionConfirmed = (id: string, transactionHash: string) =>
      this.emit('swap.update', id, { message: `Transaction confirmed: ${transactionHash}` });

    // Listen to events of the Boltz client
    this.boltz.on('transaction.confirmed', (transactionHash: string, outputAddress: string) => {
      this.pendingSwaps.forEach((swap, id) => {
        if (swap.lockupAddress === outputAddress) {
          emitTransactionConfirmed(id, transactionHash);
        }
      });

      this.pendingReverseSwaps.forEach((swap, id) => {
        if (swap.transactionHash === transactionHash) {
          emitTransactionConfirmed(id, transactionHash);
        }
      });
    });

    this.boltz.on('invoice.paid', (invoice: string) => {
      this.pendingSwaps.forEach((swap, id) => {
        if (swap.invoice === invoice) {
          this.emit('swap.update', id, { message: `Invoice paid: ${invoice}` });
        }
      });
    });

    this.boltz.on('invoice.settled', (invoice: string, preimage: string) => {
      this.pendingReverseSwaps.forEach((swap, id) => {
        if (swap.invoice === invoice) {
          this.emit('swap.update', id, {
            preimage,
            message: `Invoice settled: ${invoice}`,
          });
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
   * Gets the exchange limits for all supported pairs
   */
  public getLimits = () => {
    return mapToObject(this.rateProvider.limits);
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
    const { base, quote, rate } = this.getPair(pairId);

    const side = this.getOrderSide(orderSide);

    const chainCurrency = side === OrderSide.BUY ? quote : base;
    const lightningCurrency = side === OrderSide.BUY ? base : quote;

    const { millisatoshis } = bolt11.decode(invoice);

    this.verifyAmount(millisatoshis / 1000, pairId, side, rate);

    const {
      address,
      redeemScript,
      expectedAmount,
      timeoutBlockHeight,
    } = await this.boltz.createSwap(base, quote, side, rate, invoice, refundPublicKey, OutputType.COMPATIBILITY);
    await this.boltz.listenOnAddress(chainCurrency, address);

    const id = generateId(6);

    this.pendingSwaps.set(id, {
      invoice,
      lockupAddress: address,
    });

    return {
      id,
      address,
      redeemScript,
      expectedAmount,
      timeoutBlockHeight,
      bip21: encodeBip21(
        chainCurrency,
        address,
        expectedAmount,
        `Submarine Swap to ${lightningCurrency}`,
      ),
    };
  }

  /**
   * Creates a new reverse Swap from Lightning to the chain
   */
  public createReverseSwap = async (pairId: string, orderSide: string, claimPublicKey: string, amount: number) => {
    const { base, quote, rate } = this.getPair(pairId);

    const side = this.getOrderSide(orderSide);

    this.verifyAmount(amount, pairId, side, rate);

    const {
      invoice,
      redeemScript,
      lockupAddress,
      lockupTransaction,
      lockupTransactionHash,
    } = await this.boltz.createReverseSwap(base, quote, side, rate, claimPublicKey, amount);

    const chainCurrency = side === OrderSide.BUY ? base : quote;
    await this.boltz.listenOnAddress(chainCurrency, lockupAddress);

    const id = generateId(6);

    this.pendingReverseSwaps.set(id, {
      invoice,
      transactionHash: lockupTransactionHash,
    });

    return {
      id,
      invoice,
      redeemScript,
      lockupTransaction,
      lockupTransactionHash,
    };
  }

  /**
   * Gets the base and quote asset and the rate of a currency
   */
  private getPair = (pairId: string) => {
    const { base, quote } = splitPairId(pairId);

    const pair = this.pairs.get(pairId);
    const rate = this.rateProvider.rates.get(pairId);

    if (!pair || !rate) {
      throw Errors.PAIR_NOT_SUPPORTED(pairId);
    }

    return {
      base,
      quote,
      rate,
    };
  }

  /**
   * Verfies that the requested amount is neither above the maximal nor beneath the minimal
   */
  private verifyAmount = (satoshis: number, pairId: string, orderSide: OrderSide, rate: number) => {
    if (orderSide === OrderSide.SELL) {
      // tslint:disable-next-line:no-parameter-reassignment
      satoshis = satoshis * (1 / rate);
    }

    const limits = this.rateProvider.limits.get(pairId);

    if (limits) {
      const amount = satoshisToWholeCoins(satoshis);

      if (amount > limits.maximal) throw Errors.EXCEED_MAXIMAL_AMOUNT(amount, limits.maximal);
      if (amount < limits.minimal) throw Errors.BENEATH_MINIMAL_AMOUNT(amount, limits.minimal);
    } else {
      throw Errors.CURRENCY_NOT_SUPPORTED_BY_BACKEND(pairId);
    }
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
