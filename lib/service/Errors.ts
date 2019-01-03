import { Error } from '../consts/Types';
import { ErrorCodePrefix } from '../consts/ErrorCodePrefix';
import { concatErrorCode } from '../Utils';

export default {
  CURRENCY_NOT_SUPPORTED_BY_BACKEND: (currency: string): Error => ({
    message: `currency is not support by backend: ${currency}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 0),
  }),
  PAIR_NOT_SUPPORTED: (pairId: string): Error => ({
    message: `pair is not supported: ${pairId}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 1),
  }),
  ORDER_SIDE_NOT_SUPPORTED: (orderSide: string) => ({
    message: `order side not supported: ${orderSide}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 2),
  }),
};
