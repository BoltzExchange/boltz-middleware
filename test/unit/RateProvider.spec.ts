import Logger from '../../lib/Logger';
import RateProvider from '../../lib/rates/RateProvider';
import DataBase from '../../lib/db/Database';
import PairRepository from '../../lib/service/PairRepository';
import { expect } from 'chai';

describe('Rate Provider', () => {
  const rateProvider = new RateProvider(Logger.disabledLogger, 0.1, []);

  before(async () => {
    const db = new DataBase(Logger.disabledLogger, ':memory:');
    await db.init();
    const pairRepository = new PairRepository(db.models);
    const dbPairs = await pairRepository.getPairs();
    await rateProvider.init(dbPairs);
  });

  it('should retive rates', () => {
    const rates = rateProvider.rates;

    expect(rates).to.be.a('map');
  });

  after(async () => {
    rateProvider.disconnect();
  });
});
