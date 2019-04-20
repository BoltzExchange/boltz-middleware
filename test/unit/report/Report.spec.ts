import { expect } from 'chai';
import { mock, when, anything, instance } from 'ts-mockito';
import Swap from '../../../lib/db/models/Swap';
import Report from '../../../lib/report/Report';
import ReverseSwap from '../../../lib/db/models/ReverseSwap';
import SwapRepository from '../../../lib/service/SwapRepository';
import ReverseSwapRepository from '../../../lib/service/ReverseSwapRepository';

describe('Report', () => {
  const date = '2019-04-19 09:21:01.156 +00:00';

  const swaps: Swap[] = [];

  const swapRepositoryMock = mock(SwapRepository);
  when(swapRepositoryMock.getSwaps(anything())).thenResolve(swaps);
  const swapRepository = instance(swapRepositoryMock);

  const reverseSwaps: ReverseSwap[] = [];

  const reverseSwapRepositoryMock = mock(ReverseSwapRepository);
  when(reverseSwapRepositoryMock.getReverseSwaps(anything())).thenResolve(reverseSwaps);
  const reverseSwapRepository = instance(reverseSwapRepositoryMock);

  const report = new Report(
    swapRepository,
    reverseSwapRepository,
  );

  before(() => {
    const setMockValues = (mock: Swap | ReverseSwap, isSecond: boolean) => {
      when(mock.fee).thenReturn(1000);
      when(mock.pair).thenReturn('LTC/BTC');
      when(mock.createdAt).thenReturn(date);
      when(mock.orderSide).thenReturn(isSecond ? 1 : 0);
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

  it('should generate reports', async () => {
    const csv = await report.generate();
    const formatDate = report['formatDate'](new Date(date));

    expect(csv).to.be.equal(
      // tslint:disable-next-line: prefer-template
      'date,pair,type,orderSide,fee,feeCurrency\n' +

      `${formatDate},LTC/BTC,Lightning/Chain,buy,0.00001000,BTC\n` +
      `${formatDate},LTC/BTC,Chain/Lightning,sell,0.00001000,LTC\n` +
      `${formatDate},LTC/BTC,Chain/Lightning,buy,0.00001000,LTC\n` +
      `${formatDate},LTC/BTC,Lightning/Chain,sell,0.00001000,BTC`,
    );
  });
});
