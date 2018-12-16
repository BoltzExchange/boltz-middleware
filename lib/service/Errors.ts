import { Error } from '../consts/Types';
import { ErrorCodePrefix } from '../consts/ErrorCodePrefix';
import { concatErrorCode } from '../Utils';

export default {
  CURRENCY_NOT_SUPPORTED_BY_BACKEND: (currency: string): Error => ({
    message: `currency is not support by backend: ${currency}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 0),
  }),
};
