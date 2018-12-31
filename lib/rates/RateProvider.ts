import Logger from '../Logger';
import CryptoCompare from './CryptoCompare';
import { PairInstance } from 'lib/consts/Database';
import { getPairId, stringify, mapToObject } from '../Utils';

// TODO: add unit tests
class RateProvider {
  // A map between pair ids and their rates
  public rates = new Map<string, number>();

  // A map between quote and their base assets
  private baseAssetsMap = new Map<string, string[]>();

  private cryptoCompare = new CryptoCompare();

  constructor(private logger: Logger, private rateUpdateInterval: number) {
    this.cryptoCompare = new CryptoCompare();
  }

  /**
   * Gets a map of of rates for the provided pairs
   */
  public init = async (pairs: PairInstance[]) => {
    pairs.forEach((pair) => {
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

    setInterval(async () => {
      await this.updateRates();
    }, this.rateUpdateInterval * 60 * 1000);
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
