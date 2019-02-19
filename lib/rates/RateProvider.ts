import Logger from '../Logger';
import CryptoCompare from './CryptoCompare';
import { PairInstance } from '../consts/Database';
import { CurrencyConfig } from '../notifications/NotificationProvider';
import { getPairId, stringify, mapToObject, minutesToMilliseconds, satoshisToWholeCoins, roundToDecimals } from '../Utils';

type Limits = {
  minimal: number;
  maximal: number;
};

class RateProvider {
  // A map between pair ids and their rates
  public rates = new Map<string, number>();

  // A map between pair ids and their limits
  public limits = new Map<string, Limits>();

  // A map between quote and their base assets
  private baseAssetsMap = new Map<string, string[]>();

  // A map between assets and their limits
  private currencies = new Map<string, Limits>();

  private cryptoCompare = new CryptoCompare();

  private timer!: NodeJS.Timeout;

  constructor(private logger: Logger, private rateUpdateInterval: number, currencies: CurrencyConfig[]) {
    this.cryptoCompare = new CryptoCompare();

    this.parseCurrencies(currencies);
  }

  /**
   * Gets a map of of rates for the provided pairs
   */
  public init = async (pairs: PairInstance[]) => {
    pairs.forEach((pair) => {
      // If a pair has a hardcoded rate the CryptoCompare rate doesn't have to be queried
      if (pair.rate) {
        this.logger.debug(`Setting hardcoded rate for pair ${pair.id}: ${pair.rate}`);
        this.rates.set(pair.id, pair.rate);

        const limits = this.currencies.get(pair.base);

        if (limits) {
          this.logger.debug(`Setting limits for hardcoded pair ${pair.id}: ${stringify(limits)}`);
          this.limits.set(pair.id, limits);
        } else {
          this.logger.warn(`Could not get limits for hardcoded pair ${pair.id}`);
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

    await this.updateRates();

    this.logger.silly(`Updating rates every ${this.rateUpdateInterval} minutes`);

    this.timer = setInterval(async () => {
      await this.updateRates();
    }, minutesToMilliseconds(this.rateUpdateInterval));
  }

  public disconnect = () => {
    clearInterval(this.timer);
  }

  private updateRates = async () => {
    const promises: Promise<any>[] = [];

    this.baseAssetsMap.forEach((baseAssets, quoteAsset) => {
      promises.push(new Promise(async (resolve) => {
        const baseAssetsRates = await this.cryptoCompare.getPriceMulti(baseAssets, [quoteAsset]);

        baseAssets.forEach((baseAsset) => {
          const pair = getPairId({ base: baseAsset, quote: quoteAsset });
          const rate = baseAssetsRates[baseAsset][quoteAsset];

          this.rates.set(pair, rate);
          this.updateLimits(pair, baseAsset, quoteAsset, rate);
        });

        resolve();
      }));
    });

    await Promise.all(promises);

    this.logger.silly(`Updated rates: ${stringify(mapToObject(this.rates))}`);
    this.logger.silly(`Updated limits: ${stringify(mapToObject(this.limits))}`);
  }

  private updateLimits = (pair: string, base: string, quote: string, rate: number) => {
    const baseLimits = this.currencies.get(base);
    const quoteLimits = this.currencies.get(quote);

    if (baseLimits && quoteLimits) {
      // The limits we show are for the base asset and therefore to determine whether
      // the limits for the base or quote asset are higher for minimal or lower for
      // the maximal amount we need to multiply the quote limits times (1 / rate)
      const reverseQuoteLimits = this.calculateQuoteLimits(rate, quoteLimits);

      this.limits.set(pair, {
        maximal: Math.min(baseLimits.maximal, reverseQuoteLimits.maximal),
        minimal: Math.max(baseLimits.minimal, reverseQuoteLimits.minimal),
      });
    } else {
      this.logger.warn(`Could not get limits for pair ${pair}`);
    }
  }

  private calculateQuoteLimits = (rate: number, limits: Limits) => {
    const reverseRate = 1 / rate;

    return {
      maximal: roundToDecimals(reverseRate * limits.maximal, 8),
      minimal: roundToDecimals(reverseRate * limits.minimal, 8),
    };
  }

  private parseCurrencies = (currencies: CurrencyConfig[]) => {
    currencies.forEach((currency) => {
      this.currencies.set(currency.symbol, {
        maximal: satoshisToWholeCoins(currency.maxSwapAmount),
        minimal: satoshisToWholeCoins(currency.minSwapAmount),
      });
    });
  }
}

export default RateProvider;
