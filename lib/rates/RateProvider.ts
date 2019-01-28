import Logger from '../Logger';
import CryptoCompare from './CryptoCompare';
import { PairInstance } from 'lib/consts/Database';
import { getPairId, stringify, mapToObject, minutesToMilliseconds } from '../Utils';

class RateProvider {
  // A map between pair ids and their rates
  public rates = new Map<string, number>();

  // A map between quote and their base assets
  private baseAssetsMap = new Map<string, string[]>();

  private cryptoCompare = new CryptoCompare();

  private timer!: NodeJS.Timeout;

  constructor(private logger: Logger, private rateUpdateInterval: number) {
    this.cryptoCompare = new CryptoCompare();
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
          this.rates.set(getPairId({ base: baseAsset, quote: quoteAsset }), baseAssetsRates[baseAsset][quoteAsset]);
        });

        resolve();
      }));
    });

    await Promise.all(promises);

    this.logger.debug(`Updated rates: ${stringify(mapToObject(this.rates))}`);
  }

}

export default RateProvider;
