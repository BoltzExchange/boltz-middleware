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
    invoice: string,
    orderSide: number,
    lockupAddress: string,

    status?: string,
  }) => {
    return Swap.create(swap);
  }

  public setSwapStatus = async (swap: Swap, status: string) => {
    return swap.update({
      status,
    });
  }

  public dropTable = async () => {
    return Swap.drop();
  }
}

export default SwapRepository;
