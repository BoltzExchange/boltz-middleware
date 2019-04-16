import { WhereOptions } from 'sequelize';
import Swap from '../db/models/Swap';

class SwapRepository {

  public getSwaps = async (options?: WhereOptions) => {
    return Swap.findAll({
      where: options,
    });
  }

  public getSwap = async (options: WhereOptions) => {
    return Swap.findOne({
      where: options,
    });
  }

  public addSwap = async (swap: {
    id: string,
    fee: number,
    pair: string,
    orderSide: number,
    invoice: string,
    status?: string,
    lockupAddress: string,
  }) => {
    return Swap.create(swap);
  }

  public setSwapStatus = async (swap: Swap, status: string) => {
    return swap.update({
      status,
    });
  }
}

export default SwapRepository;
