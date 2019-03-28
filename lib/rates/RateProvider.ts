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

type BaseFees = {
  normal: number;
  reverse: number;
};

type Pair = {
  rate: number;
  limits: Limits;
  fees: {
    percentage: number;
    baseFees: {
      baseAsset: BaseFees,
      quoteAsset: BaseFees,
    };
  };
};

class RateProvider {
  // A map between the pair ids and the rate, limits and base fee of that pair
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

    const baseFees = await this.getBaseFees();

    pairs.forEach((pair) => {
      // If a pair has a hardcoded rate the CryptoCompare rate doesn't have to be queried
      if (pair.rate) {
        this.logger.debug(`Setting hardcoded rate for pair ${pair.id}: ${pair.rate}`);
        const limits = this.limits.get(pair.base);

        if (limits) {
          this.logger.debug(`Setting limits for hardcoded pair ${pair.id}: ${stringify(limits)}`);

          this.pairs.set(pair.id, {
            limits,
            rate: pair.rate,
            fees: {
              percentage: this.percentageFees.get(pair.id)!,
              baseFees: {
                baseAsset: baseFees.get(pair.base)!,
                quoteAsset: baseFees.get(pair.quote)!,
              },
            },
          });

          this.hardcodedPairs.set(pair.id, {
            base: pair.base,
            quote: pair.quote,
          });
        } else {
          this.logger.error(`Could not get limits for hardcoded pair ${pair.id}`);
        }

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

    await this.updateRates(baseFees);

    this.logger.debug(`Got pairs: ${stringify(mapToObject(this.pairs))}`);
    this.logger.silly(`Updating rates every ${this.rateUpdateInterval} minutes`);

    this.timer = setInterval(async () => {
      await this.updateRates(await this.getBaseFees());
    }, minutesToMilliseconds(this.rateUpdateInterval));
  }

  public disconnect = () => {
    clearInterval(this.timer);
  }

  private updateRates = async (baseFees: Map<string, BaseFees>) => {
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
              baseFees: {
                baseAsset: baseFees.get(baseAsset)!,
                quoteAsset: baseFees.get(quoteAsset)!,
              },
            },
          });
        });

        resolve();
      }));
    });

    // Update the base fees of the pairs with a hardcoded rate
    this.hardcodedPairs.forEach(({ base, quote }, pair) => {
      const pairInfo = this.pairs.get(pair)!;

      pairInfo.fees.baseFees = {
        baseAsset: baseFees.get(base)!,
        quoteAsset: baseFees.get(quote)!,
      };

      this.pairs.set(pair, pairInfo);
    });

    await Promise.all(promises);

    this.logger.silly(`Updated pairs: ${stringify(mapToObject(this.pairs))}`);
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

  private getBaseFees = async () => {
    const baseFees = new Map<string, BaseFees>();

    for (const [symbol] of this.limits) {
      // The can be emtpy because we just want the base fee
      const [normal, reverse] = await Promise.all([
        this.feeProvider.getFee('', symbol, 0, false),
        this.feeProvider.getFee('', symbol, 0, true),
      ]);

      baseFees.set(symbol, {
        normal,
        reverse,
      });
    }

    return baseFees;
  }
}

export default RateProvider;
