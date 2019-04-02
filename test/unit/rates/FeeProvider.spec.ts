import { expect } from 'chai';
import { mock, when, instance, anyString } from 'ts-mockito';
import Logger from '../../../lib/Logger';
import FeeProvider from '../../../lib/rates/FeeProvider';
import BoltzClient from '../../../lib/boltz/BoltzClient';

describe('FeeProvider', () => {
  const btcFee = 36;
  const ltcFee = 3;

  const boltzMock = mock(BoltzClient);
  when(boltzMock.getFeeEstimation(anyString())).thenResolve({
    feesMap: [
      ['BTC', btcFee],
      ['LTC', ltcFee],
    ],
  });

  const feeProvider = new FeeProvider(Logger.disabledLogger, instance(boltzMock));

  it('should init', () => {
    feeProvider.init([
      {
        base: 'LTC',
        quote: 'BTC',
        fee: 0.5,
      },
      {
        base: 'BTC',
        quote: 'BTC',
        fee: 0,
      },
      {
        base: 'LTC',
        quote: 'LTC',

        // The FeeProvider should set this to 1
        fee: undefined,
      },
    ]);

    const feeMap = feeProvider['percentageFees'];
    expect(feeMap.size).to.be.equal(3);

    expect(feeMap.get('LTC/BTC')).to.be.equal(0.005);
    expect(feeMap.get('BTC/BTC')).to.be.equal(0);
    expect(feeMap.get('LTC/LTC')).to.be.equal(0.01);
  });

  it('should estimate fees', async () => {
    const results = await Promise.all([
      feeProvider.getFee('LTC/BTC', 'BTC', 100000, false),
      feeProvider.getFee('LTC/BTC', 'LTC', 532100, false),

      feeProvider.getFee('BTC/BTC', 'BTC', 100000, false),
      feeProvider.getFee('BTC/BTC', 'BTC', 100000, true),

      feeProvider.getFee('LTC/LTC', 'LTC', 987654321, false),
      feeProvider.getFee('LTC/LTC', 'LTC', 987654321, true),
    ]);

    const expected = [
      5540,
      3081,

      5040,
      5508,

      9876964,
      9877003,
    ];

    results.forEach((result, index) => {
      expect(result).to.be.equal(expected[index]);
    });
  });
});
