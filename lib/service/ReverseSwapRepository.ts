import { WhereOptions } from 'sequelize';
import { Models } from '../db/Database';
import * as db from '../consts/Database';

class ReverseSwapRepository {
  constructor(private models: Models) {}

  public getReverseSwaps = async () => {
    return this.models.ReverseSwap.findAll({});
  }

  public getReverseSwap = async (options: WhereOptions<db.ReverseSwapFactory>) => {
    return this.models.ReverseSwap.findOne({
      where: options,
    });
  }

  public addReverseSwap = async (reverseSwap: db.ReverseSwapFactory) => {
    return this.models.ReverseSwap.create(reverseSwap);
  }

  public setReverseSwapStatus = async (reverseSwap: db.ReverseSwapInstance, status: string) => {
    return reverseSwap.update({
      status,
    });
  }

  public updateReverseSwap = async (reverseSwap: db.ReverseSwapInstance, keys: object) => {
    return reverseSwap.update(keys);
  }
}

export default ReverseSwapRepository;
