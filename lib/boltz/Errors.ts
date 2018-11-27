import { Error } from '../consts/Types';
import { ErrorCodePrefix } from '../consts/ErrorCodePrefix';
import { concatErrorCode } from '../Utils';

export default {
  COULD_NOT_FIND_FILES: (file: string): Error => ({
    message: `could not find required files for Boltz: ${file}`,
    code: concatErrorCode(ErrorCodePrefix.Boltz, 0),
  }),
};
