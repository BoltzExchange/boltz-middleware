import { expect } from 'chai';
import Logger from '../../../lib/Logger';
import Database from '../../../lib/db/Database';
import RateProvider from '../../../lib/rates/RateProvider';
import PairRepository from '../../../lib/service/PairRepository';

describe('RateProvider', () => {
  const decimals = 100000000;

  const currencyConfig = {
    maxSwapAmount: 10 * decimals,
    minSwapAmount: 1 * decimals,

    minWalletBalance: 0,

    minLocalBalance: 0,
    minRemoteBalance: 0,
  };

  const rateProvider = new RateProvider(Logger.disabledLogger, 0.1, [
    {
      symbol: 'BTC',
      ...currencyConfig,
    },
    {
      symbol: 'LTC',
      ...currencyConfig,
    },
  ]);

  const db = new Database(Logger.disabledLogger, ':memory:');
  const pairRepository = new PairRepository(db.models);

  before(async () => {
    await db.init();

    await pairRepository.addPair({
      base: 'BTC',
      quote: 'BTC',
      rate: 1,
    });

    await pairRepository.addPair({
      base: 'LTC',
      quote: 'BTC',
    });

    const dbPairs = await pairRepository.getPairs();
    await rateProvider.init(dbPairs);
  });

  it('should get rates', async () => {
    const { rates } = rateProvider;

    expect(rates.get('BTC/BTC')).to.be.equal(1);
    expect(rates.get('LTC/BTC')).to.be.a('number');
  });

  it('should get limits', async () => {
    const { limits } = rateProvider;

    expect(limits.get('BTC/BTC')).to.be.deep.equal({
      maximal: 10,
      minimal: 1,
    });

    const calculatedLimits = limits.get('LTC/BTC');

    expect(calculatedLimits).to.be.not.be.undefined;
    expect(calculatedLimits!.maximal).to.be.a('number');
    expect(calculatedLimits!.minimal).to.be.a('number');
  });

  after(async () => {
    rateProvider.disconnect();
  });
});
