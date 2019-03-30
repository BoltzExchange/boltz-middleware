import Logger from '../Logger';
import FeeProvider from './FeeProvider';
import CryptoCompare from './CryptoCompare';
import { CurrencyConfig } from '../consts/Types';
import { PairInstance } from '../consts/Database';
import { getPairId, stringify, mapToObject, minutesToMilliseconds } from '../Utils';

type Limits = {
  minimal: number;
  maximal: number;
};

type ReverseMinerFees = {
  lockup: number;
  claim: number;
};

type MinerFees = {
  normal: number;
  reverse: ReverseMinerFees;
};

type Pair = {
  rate: number;
  limits: Limits;
  fees: {
    percentage: number;
    minerFees: {
      baseAsset: MinerFees,
      quoteAsset: MinerFees,
    };
  };
};

class RateProvider {
  // A map between the pair ids and the rate, limits and fees of that pair
  public pairs = new Map<string, Pair>();

  // A map between quote and their base assets
  // So that there is just one CryptoCompare request per quote asset needed
  private baseAssetsMap = new Map<string, string[]>();

  // A map of all pairs with hardcoded rates
  private hardcodedPairs = new Map<string, { base: string, quote: string }>();

  // A map between assets and their limits
  private limits = new Map<string, Limits>();

  // A copy of the "percentageFees" Map in the FeeProvider but all values are multiplied with 100
  private percentageFees = new Map<string, number>();

  private cryptoCompare = new CryptoCompare();

  private timer!: NodeJS.Timeout;

  constructor(
    private logger: Logger,
    private feeProvider: FeeProvider,
    private rateUpdateInterval: number,
    currencies: CurrencyConfig[]) {

    this.cryptoCompare = new CryptoCompare();

    this.parseCurrencies(currencies);
  }

  /**
   * Gets a map of of rates from CryptoCompare for the provided pairs
   */
  public init = async (pairs: PairInstance[]) => {
    this.feeProvider.percentageFees.forEach((percentage, pair) => {
      // Multiply with 100 to get the percentage
      this.percentageFees.set(pair, percentage * 100);
    });

    const minerFees = await this.getMinerFees();

    pairs.forEach((pair) => {
      // If a pair has a hardcoded rate the CryptoCompare rate doesn't have to be queried
      if (pair.rate) {
        this.logger.debug(`Setting hardcoded rate for pair ${pair.id}: ${pair.rate}`);

        this.pairs.set(pair.id, {
          rate: pair.rate,
          limits: this.getLimits(pair.id, pair.base, pair.quote, pair.rate),
          fees: {
            percentage: this.percentageFees.get(pair.id)!,
            minerFees: {
              baseAsset: minerFees.get(pair.base)!,
              quoteAsset: minerFees.get(pair.quote)!,
            },
          },
        });

        this.hardcodedPairs.set(pair.id, {
          base: pair.base,
          quote: pair.quote,
        });

        return;
      }

      const baseAssets = this.baseAssetsMap.get(pair.quote);

      if (baseAssets) {
        baseAssets.push(pair.base);
      } else {
        this.baseAssetsMap.set(pair.quote, [pair.base]);
      }
    });

    this.logger.silly(`Prepared data for requests to CryptoCompare: ${stringify(mapToObject(this.baseAssetsMap))}`);

    await this.updateRates(minerFees);

    this.logger.debug(`Got pairs: ${stringify(mapToObject(this.pairs))}`);
    this.logger.silly(`Updating rates every ${this.rateUpdateInterval} minutes`);

    this.timer = setInterval(async () => {
      await this.updateRates(await this.getMinerFees());
    }, minutesToMilliseconds(this.rateUpdateInterval));
  }

  public disconnect = () => {
    clearInterval(this.timer);
  }

  private updateRates = async (minerFees: Map<string, MinerFees>) => {
    const promises: Promise<any>[] = [];

    // Update the pairs with a variable rate
    this.baseAssetsMap.forEach((baseAssets, quoteAsset) => {
      promises.push(new Promise(async (resolve) => {
        const baseAssetsRates = await this.cryptoCompare.getPriceMulti(baseAssets, [quoteAsset]);

        baseAssets.forEach((baseAsset) => {
          const pair = getPairId({ base: baseAsset, quote: quoteAsset });
          const rate = baseAssetsRates[baseAsset][quoteAsset];

          const limits = this.getLimits(pair, baseAsset, quoteAsset, rate);

          this.pairs.set(pair, {
            rate,
            limits,
            fees: {
              percentage: this.percentageFees.get(pair)!,
              minerFees: {
                baseAsset: minerFees.get(baseAsset)!,
                quoteAsset: minerFees.get(quoteAsset)!,
              },
            },
          });
        });

        resolve();
      }));
    });

    // Update the miner fees of the pairs with a hardcoded rate
    this.hardcodedPairs.forEach(({ base, quote }, pair) => {
      const pairInfo = this.pairs.get(pair)!;

      pairInfo.fees.minerFees = {
        baseAsset: minerFees.get(base)!,
        quoteAsset: minerFees.get(quote)!,
      };

      this.pairs.set(pair, pairInfo);
    });

    await Promise.all(promises);

    this.logger.silly('Updated pairs');
  }

  private getLimits = (pair: string, base: string, quote: string, rate: number) => {
    const baseLimits = this.limits.get(base);
    const quoteLimits = this.limits.get(quote);

    if (baseLimits && quoteLimits) {
      // The limits we show are for the base asset and therefore to determine whether
      // the limits for the base or quote asset are higher for the minimal or lower for
      // the maximal amount we need to multiply the quote limits times (1 / rate)
      const reverseQuoteLimits = this.calculateQuoteLimits(rate, quoteLimits);

      return {
        maximal: Math.min(baseLimits.maximal, reverseQuoteLimits.maximal),
        minimal: Math.max(baseLimits.minimal, reverseQuoteLimits.minimal),
      };
    }

    throw `Could not get limits for pair ${pair}`;
  }

  private calculateQuoteLimits = (rate: number, limits: Limits) => {
    const reverseRate = 1 / rate;

    return {
      maximal: Math.floor(reverseRate * limits.maximal),
      minimal: Math.floor(reverseRate * limits.minimal),
    };
  }

  private parseCurrencies = (currencies: CurrencyConfig[]) => {
    currencies.forEach((currency) => {
      this.limits.set(currency.symbol, {
        maximal: currency.maxSwapAmount,
        minimal: currency.minSwapAmount,
      });
    });
  }

  private getMinerFees = async () => {
    const minerFees = new Map<string, MinerFees>();

    for (const [symbol] of this.limits) {
      // The pair and amount can be emtpy because we just want the miner fee
      const [normal, reverseLockup] = await Promise.all([
        this.feeProvider.getFee('', symbol, 0, false),
        this.feeProvider.getFee('', symbol, 0, true),
      ]);

      minerFees.set(symbol, {
        normal,
        reverse: {
          lockup: reverseLockup,

          // We cannot know what kind of address the user will claim to so we just assume the worst case: P2PKH
          //
          // Claiming a P2WSH to a P2PKH address is about 138 bytes and to get the sats per vbyte we divide the
          // reverse fee by the size of the reverse lockup transaction (153 vbyte)
          claim: FeeProvider.transactionSizes.reverseClaim * (reverseLockup / FeeProvider.transactionSizes.reverseLockup),
        },
      });
    }

    return minerFees;
  }
}

export default RateProvider;
