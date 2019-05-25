import { expect } from 'chai';
import { mock, when, instance, anything } from 'ts-mockito';
import Binance from '../../../../lib/rates/data/exchanges/Binance';
import DataProvider from '../../../../lib/rates/data/DataProvider';

describe('DataProvider', () => {
  const baseAsset = 'LTC';
  const quoteAsset = 'BTC';

  const prices = [
    10,
    2,
    38,
    23,
    38,
    23,
    21,
    16,
    1000,
    0,
  ];

  const dataProvider = new DataProvider();
  const exchanges = dataProvider['exchanges'];

  before(() => {
    // To clear the existing 'readonly' array
    dataProvider['exchanges'].length = 0;

    prices.forEach((price) => {
      const exchangeMock = mock(Binance);
      when(exchangeMock.getPrice(anything(), anything())).thenResolve(price);

      exchanges.push(instance(exchangeMock));
    });
  });

  it('should calculate the median price of arrays with an even length', async () => {
    const price = await dataProvider.getPrice(baseAsset, quoteAsset);
    expect(price).to.be.equal(22);
  });

  it('should calculate the median price of array with an uneven length', async () => {
    const exchangeMock = mock(Binance);
    when(exchangeMock.getPrice(anything(), anything())).thenResolve(35);

    exchanges.push(instance(exchangeMock));

    const price = await dataProvider.getPrice(baseAsset, quoteAsset);
    expect(price).to.be.equal(23);
  });

  it('should calculate the median price of arrays with just one entry', async () => {
    const singleDataProvider = new DataProvider();

    const exchangePrice = 5;

    const exchangeMock = mock(Binance);
    when(exchangeMock.getPrice(anything(), anything())).thenResolve(exchangePrice);

    singleDataProvider['exchanges'].length = 0;
    singleDataProvider['exchanges'].push(instance(exchangeMock));

    const price = await singleDataProvider.getPrice(baseAsset, quoteAsset);
    expect(price).to.be.equal(exchangePrice);
  });

  it('should handle errors', async () => {
    const exchangeMock = mock(Binance);
    when(exchangeMock.getPrice(anything(), anything())).thenReject('API error');

    exchanges.push(instance(exchangeMock));

    const price = await dataProvider.getPrice(baseAsset, quoteAsset);
    expect(price).to.be.equal(23);
  });
});
