import Logger from '../Logger';
import CryptoCompare from './CryptoCompare';
import { PairInstance } from 'lib/consts/Database';
import { getPairId, stringify, mapToArray } from '../Utils';

// TODO: add unit tests
class RateProvider {
  private cryptoCompare: CryptoCompare;

  constructor(private logger: Logger) {
    this.cryptoCompare = new CryptoCompare();
  }

  /**
   * Gets a map of of rates for the provided pairs
   */
  public getRates = async (pairs: PairInstance[]) => {
    // A map between the quote and their base assets
    const baseAssetsMap = new Map<string, string[]>();

    pairs.forEach((pair) => {
      const baseAssets = baseAssetsMap.get(pair.quote);

      if (baseAssets) {
        baseAssets.push(pair.base);
      } else {
        baseAssetsMap.set(pair.quote, [pair.base]);
      }
    });

    this.logger.silly(`Prepared data for requests to CryptoCompare: ${stringify(mapToArray(baseAssetsMap))}`);

    const rates = new Map<string, number>();

    const promises: Promise<any>[] = [];

    baseAssetsMap.forEach((baseAssets, quoteAsset) => {
      promises.push(new Promise(async (resolve) => {
        const baseAssetsRates = await this.cryptoCompare.getPriceMulti(baseAssets, [quoteAsset]);

        baseAssets.forEach((baseAsset) => {
          rates.set(getPairId({ base: baseAsset, quote: quoteAsset }), baseAssetsRates[baseAsset][quoteAsset]);
        });

        resolve();
      }));
    });

    await Promise.all(promises);

    this.logger.debug(`Got updated rates: ${stringify(mapToArray(rates))}`);

    return rates;
  }
}

export default RateProvider;
