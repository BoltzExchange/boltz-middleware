import os from 'os';
import { expect } from 'chai';
import * as utils from '../../lib/Utils';
import { OrderSide } from '../../lib/proto/boltzrpc_pb';

describe('Utils', () => {
  const randomRange = (max: number): number => {
    return Math.floor(Math.random() * Math.floor(max));
  };

  let pairId: string;

  const pair = {
    base: 'BTC',
    quote: 'LTC',
  };

  it('should generate ids', () => {
    const random = randomRange(10);
    expect(utils.generateId(random)).lengthOf(random);
  });

  it('should get pair ids', () => {
    pairId = utils.getPairId(pair);
    expect(pairId).to.be.equal('BTC/LTC');
  });

  it('should split pair ids', () => {
    const split = utils.splitPairId(pairId);
    expect(pair.base === split.base && pair.quote === split.quote).to.be.true;
  });

  it('should concat error codes', () => {
    const prefix = 0;
    const code = 1;

    expect(utils.concatErrorCode(prefix, code)).to.be.equal(`${prefix}.${code}`);
  });

  it('should check types of variables', () => {
    expect(utils.isObject([])).to.be.false;
    expect(utils.isObject({})).to.be.true;
  });

  it('should capitalize the first letter', () => {
    const input = 'boltz';
    const result = input.charAt(0).toUpperCase() + input.slice(1);

    expect(utils.capitalizeFirstLetter(input)).to.be.equal(result);
  });

  it('should resolve home', () => {
    const input = '~.boltz';

    if (os.platform() !== 'win32') {
      expect(utils.resolveHome(input).charAt(0)).to.be.equal('/');
    } else {
      expect(utils.resolveHome(input)).to.be.equal(input);
    }
  });

  it('should convert minutes into milliseconds', () => {
    const random = randomRange(10);
    const milliseconds = random * 60 * 1000;

    expect(utils.minutesToMilliseconds(random)).to.equal(milliseconds);
  });

  it('should convert satoshis to whole coins', () => {
    const randomSat = randomRange(7000);
    const coins = Number((randomSat / 100000000).toFixed(8));
    expect(utils.satoshisToCoins(randomSat)).to.equal(coins);
  });

  it('should convert fee map to object', () => {
    const map: [string, number][] = [['BTC', 100], ['LTC', 2]];

    expect(utils.feeMapToObject(map)).to.be.deep.equal({
      BTC: 100,
      LTC: 2,
    });
  });

  it('should get smallest denomination of symbol', () => {
    expect(utils.getSmallestDenomination('LTC')).to.be.equal('litoshi');
    expect(utils.getSmallestDenomination('BTC')).to.be.equal('satoshi');
  });

  it('should get amount of invoice', () => {
    expect(utils.getInvoiceAmount(
      // tslint:disable-next-line: max-line-length
      'lnbcrt100u1pwddnw3pp5rykwp0q399hrcluxnyhv7kfpmk4uttpu00wx9098cesacr9yzk8sdqqcqzpgn9g5vjr0qcudrgu66phz5tx0j0fnxe0gzyl5u6yat9y3xskrqyhherceutcuh9m6h89anphe5un3qac8f2r9j5hykn3uh6z0zkp9racp5lecss',
    )).to.be.equal(10000);

    expect(utils.getInvoiceAmount(
      // tslint:disable-next-line: max-line-length
      'lnbcrt987650n1pwddnskpp5d4tw4gpjgqdqlgkq5yc309r2kguure53cff8a0kjta5hurltc4yqdqqcqzpgzeu404h9udp5ay39kdvau7m5kdkvycajfhx46slgkfgyhpngnztptulxpx8s7qncp45v5nxjulje5268cu22gxysg9hm3ul8ktrw5zgqcg98hg',
    )).to.be.equal(98765);
  });

  it('should get rate', () => {
    const rate = 2;
    const reverseRate = 1 / rate;

    expect(utils.getRate(rate, OrderSide.BUY, true)).to.be.equal(reverseRate);
    expect(utils.getRate(rate, OrderSide.SELL, true)).to.be.equal(rate);

    expect(utils.getRate(rate, OrderSide.BUY, false)).to.be.equal(rate);
    expect(utils.getRate(rate, OrderSide.SELL, false)).to.be.equal(reverseRate);
  });

  it('should the chain currency', () => {
    const { base, quote } = pair;

    expect(utils.getChainCurrency(base, quote, OrderSide.BUY, true)).to.be.equal(base);
    expect(utils.getChainCurrency(base, quote, OrderSide.SELL, true)).to.be.equal(quote);

    expect(utils.getChainCurrency(base, quote, OrderSide.BUY, false)).to.be.equal(quote);
    expect(utils.getChainCurrency(base, quote, OrderSide.SELL, false)).to.be.equal(base);
  });

  it('should the lightning currency', () => {
    const { base, quote } = pair;

    expect(utils.getLightningCurrency(base, quote, OrderSide.BUY, true)).to.be.equal(quote);
    expect(utils.getLightningCurrency(base, quote, OrderSide.SELL, true)).to.be.equal(base);

    expect(utils.getLightningCurrency(base, quote, OrderSide.BUY, false)).to.be.equal(base);
    expect(utils.getLightningCurrency(base, quote, OrderSide.SELL, false)).to.be.equal(quote);
  });
});
