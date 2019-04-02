import { expect } from 'chai';
import { mock, when, instance, anything } from 'ts-mockito';
import Logger from '../../../lib/Logger';
import Database from '../../../lib/db/Database';
import FeeProvider from '../../../lib/rates/FeeProvider';
import RateProvider from '../../../lib/rates/RateProvider';
import CryptoCompare from '../../../lib/rates/CryptoCompare';
import PairRepository from '../../../lib/service/PairRepository';

describe('RateProvider', () => {
  const currencyConfig = {
    maxSwapAmount: 1000000,
    minSwapAmount: 1000,

    minWalletBalance: 0,

    minLocalBalance: 0,
    minRemoteBalance: 0,
  };

  // Rates in BTC
  const rates = {
    LTC: 0.015,
    BTC: 1,
  };

  const percentageFees = new Map<string, number>([
    ['LTC/BTC', 0.01],
    ['BTC/BTC', 0.005],
  ]);

  const minerFees = {
    BTC: {
      normal: FeeProvider.transactionSizes.normalClaim * 2,
      reverse: {
        lockup: FeeProvider.transactionSizes.reverseLockup * 2,
        claim: FeeProvider.transactionSizes.reverseClaim * 2,
      },
    },
    LTC: {
      normal: FeeProvider.transactionSizes.normalClaim ,
      reverse: {
        lockup: FeeProvider.transactionSizes.reverseLockup,
        claim: FeeProvider.transactionSizes.reverseClaim,
      },
    },
  };

  const feeProviderMock = mock(FeeProvider);
  when(feeProviderMock.percentageFees).thenReturn(percentageFees);

  when(feeProviderMock.getFee('', 'BTC', 0, false)).thenResolve(minerFees.BTC.normal);
  when(feeProviderMock.getFee('', 'BTC', 0, true)).thenResolve(minerFees.BTC.reverse.lockup);

  when(feeProviderMock.getFee('', 'LTC', 0, false)).thenResolve(minerFees.LTC.normal);
  when(feeProviderMock.getFee('', 'LTC', 0, true)).thenResolve(minerFees.LTC.reverse.lockup);

  const rateProvider = new RateProvider(Logger.disabledLogger, instance(feeProviderMock), 0.1, [
    {
      symbol: 'BTC',
      ...currencyConfig,
    },
    {
      symbol: 'LTC',
      ...currencyConfig,
    },
  ]);

  // Also mock the CryptoCompare client so that the tests don't rely on their API
  //
  // The integration tests should make sure that the client is still compatible with
  // the latest version of the CryptoCompare API
  const cryptoCompareMock = mock(CryptoCompare);
  when(cryptoCompareMock.getPriceMulti(anything(), anything())).thenResolve({
    LTC: {
      BTC: rates.LTC,
    },
  });

  rateProvider['cryptoCompare'] = instance(cryptoCompareMock);

  const db = new Database(Logger.disabledLogger, ':memory:');
  const pairRepository = new PairRepository(db.models);

  before(async () => {
    await db.init();

    await Promise.all([
      pairRepository.addPair({
        base: 'LTC',
        quote: 'BTC',
      }),
      pairRepository.addPair({
        base: 'BTC',
        quote: 'BTC',

        // 1 BTC = 1 BTC
        rate: rates.BTC,
      }),
    ]);
  });

  it('should init', async () => {
    const dbPairs = await pairRepository.getPairs();
    await rateProvider.init(dbPairs);
  });

  it('should get rates', () => {
    const { pairs } = rateProvider;

    expect(pairs.get('BTC/BTC')!.rate).to.be.equal(rates.BTC);
    expect(pairs.get('LTC/BTC')!.rate).to.be.equal(rates.LTC);
  });

  it('should get limits', () => {
    const { pairs } = rateProvider;

    expect(pairs.get('BTC/BTC')!.limits).to.be.deep.equal({ maximal: currencyConfig.maxSwapAmount, minimal: currencyConfig.minSwapAmount });
    expect(pairs.get('LTC/BTC')!.limits).to.be.deep.equal({
      maximal: currencyConfig.maxSwapAmount,
      minimal: Math.floor(currencyConfig.minSwapAmount / rates.LTC),
    });
  });

  it('should get percentage fees', () => {
    const { pairs } = rateProvider;

    percentageFees.forEach((_, pairId) => {
      expect(pairs.get(pairId)!.fees.percentage).to.be.equal(percentageFees.get(pairId)! * 100);
    });
  });

  it('should get miner fees', () => {
    const { pairs } = rateProvider;

    expect(pairs.get('BTC/BTC')!.fees.minerFees).to.be.deep.equal({ baseAsset: minerFees.BTC, quoteAsset: minerFees.BTC });
    expect(pairs.get('LTC/BTC')!.fees.minerFees).to.be.deep.equal({ baseAsset: minerFees.LTC, quoteAsset: minerFees.BTC });
  });

  after(async () => {
    rateProvider.disconnect();
  });
});
