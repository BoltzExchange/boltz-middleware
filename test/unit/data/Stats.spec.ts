import { expect } from 'chai';
import { mock, when, anything, instance } from 'ts-mockito';
import Stats from '../../../lib/data/Stats';
import Swap from '../../../lib/db/models/Swap';
import { stringify } from '../../../lib/Utils';
import { OrderSide } from '../../../lib/proto/boltzrpc_pb';
import ReverseSwap from '../../../lib/db/models/ReverseSwap';
import SwapRepository from '../../../lib/service/SwapRepository';
import ReverseSwapRepository from '../../../lib/service/ReverseSwapRepository';

describe('Stats', () => {
  const quoteSymbol = 'BTC';

  const onchainAmount = 54321;
  const lightningAmount = 12345;

  // tslint:disable-next-line: max-line-length
  const invoice = 'lnbcrt123450n1pw0tzpcpp5tfsw3wjufkwfvw7anfpg4lkjdgvalzhygzcgj5d34zfhrt3q8tuqdqqcqzpgncs58qgtpx06ztdd7v34mjpj8k5qfxguhk85qgnhkuhr9axkrs93zmtxwmpmqhdltlcfhegss55mpq29q3ev8dlzw2gepcfenhp2yqcpdpv6eh';

  const swaps: Swap[] = [];

  const swapRepositoryMock = mock(SwapRepository);
  when(swapRepositoryMock.getSwaps(anything())).thenResolve(swaps);
  const swapRepository = instance(swapRepositoryMock);

  const reverseSwaps: ReverseSwap[] = [];

  const reverseSwapRepositoryMock = mock(ReverseSwapRepository);
  when(reverseSwapRepositoryMock.getReverseSwaps(anything())).thenResolve(reverseSwaps);
  const reverseSwapRepository = instance(reverseSwapRepositoryMock);

  const stats = new Stats(
    swapRepository,
    reverseSwapRepository,
  );

  before(() => {
    // Add some swaps to the mocked repositories
    const setMockValues = (mock: Swap | ReverseSwap, isBuy: boolean) => {
      when(mock.pair).thenReturn('LTC/BTC');
      when(mock.minerFee).thenReturn(10000);
      when(mock.invoice).thenReturn(invoice);
      when(mock.orderSide).thenReturn(isBuy ? 0 : 1);
      when(mock.onchainAmount).thenReturn(onchainAmount);
    };

    for (let i = 0; i < 2; i += 1) {
      const swapMock = mock(Swap);
      const reverseSwapMock = mock(ReverseSwap);

      setMockValues(swapMock, i === 1);
      setMockValues(reverseSwapMock, i === 1);

      swaps.push(instance(swapMock));
      reverseSwaps.push(instance(reverseSwapMock));
    }
  });

  it('should generate statistics', async () => {
    expect(await stats.generate()).to.be.equal(stringify({
      failureRates: {
        swaps: 0.5,
        reverseSwaps: 0.5,
      },
      volume: {
        [quoteSymbol]: 0.00133332,
      },
      trades: {
        'LTC/BTC': swaps.length + reverseSwaps.length,
      },
    }));
  });

  it('should format volume map', () => {
    const volume = 123456789;

    stats['volumeMap'] = new Map<string, number>([
      [quoteSymbol, volume],
    ]);

    expect(
      stats['formatVolumeMap'](),
    ).to.be.deep.equal({
      [quoteSymbol]: volume / 100000000,
    });

    stats['volumeMap'].clear();
  });

  it('should get the quote amount of a swap', () => {
    const getSwapAmount = stats['getSwapAmount'];

    expect(getSwapAmount(false, OrderSide.BUY, onchainAmount, invoice)).to.be.equal(onchainAmount);
    expect(getSwapAmount(false, OrderSide.SELL, onchainAmount, invoice)).to.be.equal(lightningAmount);

    expect(getSwapAmount(true, OrderSide.BUY, onchainAmount, invoice)).to.be.equal(lightningAmount);
    expect(getSwapAmount(true, OrderSide.SELL, onchainAmount, invoice)).to.be.equal(onchainAmount);
  });

  it('should add swaps to volume map', () => {
    stats['volumeMap'].clear();

    const addToVolume = stats['addToVolume'];

    const volume = 500;

    addToVolume(quoteSymbol, volume / 2);
    addToVolume(quoteSymbol, volume / 2);

    expect(stats['volumeMap'].get(quoteSymbol)).to.be.equal(volume);
  });

  it('should add swaps to trades per pair map', () => {
    stats['tradesPerPair'].clear();

    const addToTrades = stats['addToTrades'];

    const pairs = new Map<string, number>([
      ['LTC/BTC', 21],
      ['BTC/BTC', 23],
    ]);

    pairs.forEach((trades, pair) => {
      for (let i = 0; i < trades; i += 1) {
        addToTrades(pair);
      }
    });

    expect(stats['tradesPerPair']).to.be.deep.equal(pairs);
  });
});
