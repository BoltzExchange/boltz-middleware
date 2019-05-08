import { WhereOptions } from 'sequelize';
import ReverseSwap from '../db/models/ReverseSwap';

class ReverseSwapRepository {

  public getReverseSwaps = async (options?: WhereOptions) => {
    return ReverseSwap.findAll({
      where: options,
    });
  }

  public getReverseSwap = async (options: WhereOptions) => {
    return ReverseSwap.findOne({
      where: options,
    });
  }

  public addReverseSwap = async (reverseSwap: {
    id: string,
    fee: number,
    pair: string,
    invoice: string,
    orderSide: number,
    transactionId: string,

    status?: string,
    preimage?: string,
  }) => {
    return ReverseSwap.create(reverseSwap);
  }

  public setReverseSwapStatus = async (reverseSwap: ReverseSwap, status: string) => {
    return reverseSwap.update({
      status,
    });
  }

  public updateReverseSwap = async (reverseSwap: ReverseSwap, keys: object) => {
    return reverseSwap.update(keys);
  }

  public dropTable = async () => {
    return ReverseSwap.drop();
  }
}

export default ReverseSwapRepository;
