import os from 'os';
import { expect } from 'chai';
import * as utils from '../../lib/Utils';
import { PairFactory } from '../../lib/consts/Database';

describe('Utils', () => {
  const randomRange = (max: number): number => {
    return Math.floor(Math.random() * Math.floor(max));
  };

  let pairId: string;

  const pair: PairFactory = {
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

  it('should get current date in LocaleString format', () => {
    const currenDate = utils.getTsString();
    const date = (new Date()).toLocaleString('en-US', { hour12: false });
    expect(currenDate).to.be.equal(date);
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
    expect(utils.satoshisToWholeCoins(randomSat)).to.equal(coins);
  });
});
