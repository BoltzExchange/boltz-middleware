import { Error } from '../consts/Types';
import { ErrorCodePrefix } from '../consts/ErrorCodePrefix';
import { concatErrorCode } from '../Utils';

export default {
  COULD_NOT_GET_RATE: (error: string): Error => ({
    message: `could not get rate: ${error}`,
    code: concatErrorCode(ErrorCodePrefix.RateProvider, 0),
  }),
};
