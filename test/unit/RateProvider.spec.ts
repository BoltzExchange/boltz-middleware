import Logger from '../../lib/Logger';
import RateProvider from '../../lib/rates/RateProvider';

describe('Rate Provider', () => {
  const rateProvider = new RateProvider(Logger.disabledLogger, 0.1);
  rateProvider.rates;
});
