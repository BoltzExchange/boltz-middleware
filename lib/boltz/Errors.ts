import { Error } from '../consts/Types';
import { concatErrorCode } from '../Utils';
import { ErrorCodePrefix } from '../consts/Enums';

export default {
  COULD_NOT_FIND_FILES: (file: string): Error => ({
    message: `could not find required files for Boltz: ${file}`,
    code: concatErrorCode(ErrorCodePrefix.BoltzClient, 0),
  }),
};
