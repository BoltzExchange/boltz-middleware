import { expect } from 'chai';
import Kraken from '../../../../lib/rates/data/exchanges/Kraken';
import Binance from '../../../../lib/rates/data/exchanges/Binance';
import Bitfinex from '../../../../lib/rates/data/exchanges/Bitfinex';
import Poloniex from '../../../../lib/rates/data/exchanges/Poloniex';
import CoinbasePro from '../../../../lib/rates/data/exchanges/CoinbasePro';

describe('Exchanges', () => {
  it('should get price from Binance', async () => {
    const binance = new Binance();
    const price = await binance.getPrice(baseAsset, quoteAsset);

    checkPrice(price);
  });

  it('should get price from Bitfinex', async () => {
    const bitfinex = new Bitfinex();
    const price = await bitfinex.getPrice(baseAsset, quoteAsset);

    checkPrice(price);
  });

  it('should get price from Coinbase Pro', async () => {
    const coinbase = new CoinbasePro();
    const price = await coinbase.getPrice(baseAsset, quoteAsset);

    checkPrice(price);
  });

  it('should get price from Kraken', async () => {
    const kraken = new Kraken();
    const price = await kraken.getPrice(baseAsset, quoteAsset);

    checkPrice(price);
  });

  it('should get price from Poloniex', async () => {
    const poloniex = new Poloniex();
    const price = await poloniex.getPrice(baseAsset, quoteAsset);

    checkPrice(price);
  });
});

export const baseAsset = 'ltc';
export const quoteAsset = 'BTC';

export const checkPrice = (price: any) => {
  expect(price).to.be.a('number');

  expect(price).to.be.lessThan(1);
  expect(price).to.be.greaterThan(0);
};
