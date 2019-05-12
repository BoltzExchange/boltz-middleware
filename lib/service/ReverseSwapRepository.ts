import { WhereOptions } from 'sequelize';
import { SwapUpdateEvent } from '../consts/Enums';
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
    minerFee: number,
    orderSide: number,
    onchainAmount: number,
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

  public setInvoiceSettled = async (reverseSwap: ReverseSwap, preimage: string) => {
    return reverseSwap.update({
      preimage,
      status: SwapUpdateEvent.InvoiceSettled,
    });
  }

  public setTransactionRefunded = async (reverseSwap: ReverseSwap, minerFee: number) => {
    return reverseSwap.update({
      minerFee: reverseSwap.minerFee + minerFee,
      status: SwapUpdateEvent.TransactionRefunded,
    });
  }

  public dropTable = async () => {
    return ReverseSwap.drop();
  }
}

export default ReverseSwapRepository;
