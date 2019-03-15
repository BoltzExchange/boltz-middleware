import { WhereOptions } from 'sequelize';
import { Models } from '../db/Database';
import * as db from '../consts/Database';

class SwapRepository {
  constructor(private models: Models) {}

  public getSwaps = async (options?: WhereOptions<db.SwapFactory>) => {
    return this.models.Swap.findAll({
      where: options,
    });
  }

  public getSwap = async (options: WhereOptions<db.SwapFactory>) => {
    return this.models.Swap.findOne({
      where: options,
    });
  }

  public addSwap = async (swap: db.SwapFactory) => {
    return this.models.Swap.create(swap);
  }

  public setSwapStatus = async (swap: db.SwapInstance, status: string) => {
    return swap.update({
      status,
    });
  }
}

export default SwapRepository;
