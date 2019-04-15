import { Error } from '../consts/Types';
import { concatErrorCode } from '../Utils';
import { ErrorCodePrefix } from '../consts/Enums';

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
  EXCEED_MAXIMAL_AMOUNT: (amount: number, maximalAmount: number) => ({
    message: `${amount} is more than maximal ${maximalAmount}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 3),
  }),
  BENEATH_MINIMAL_AMOUNT: (amount: number, minimalAmount: number) => ({
    message: `${amount} is less than minimal ${minimalAmount}`,
    code: concatErrorCode(ErrorCodePrefix.Service, 4),
  }),
  SWAP_WITH_INVOICE_EXISTS_ALREADY: (): Error => ({
    message: 'a swap with this invoice exists already',
    code: concatErrorCode(ErrorCodePrefix.Service, 5),
  }),
  REVERSE_SWAPS_DISABLED: (): Error => ({
    message: 'reverse swaps are disabled',
    code: concatErrorCode(ErrorCodePrefix.Service, 6),
  }),
};
