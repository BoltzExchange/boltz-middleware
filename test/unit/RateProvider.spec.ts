import Logger from '../../lib/Logger';
import RateProvider from '../../lib/rates/RateProvider';
import DataBase from '../../lib/db/Database';
import PairRepository from '../../lib/service/PairRepository';

describe('Rate Provider', () => {
  const rateProvider = new RateProvider(Logger.disabledLogger, 0.1);

  before(async () => {
    const db = new DataBase(Logger.disabledLogger,':memory:');
    await db.init();
    const pairRepository = new PairRepository(db.models);
    let dbPairs = await pairRepository.getPairs();
    await rateProvider.init(dbPairs);
  });

  it('should retive rates', () => {
    const rates = rateProvider.rates;
    console.log(rates);
  });

  after(async () => {
    clearInterval(10)
  });
});

const connectPromise = async (rateProvider: RateProvider, pairs: RateProvider[]) => {
  return new Promise(async (resolve) => {
    await rateProvider

    const interval = setInterval(async () => {
      try {
        await .getInfo();
        clearInterval(interval);
        resolve();
      } catch (error) {}
    }, 1000);
  });
};
