import { WhereOptions } from 'sequelize';
import Swap from '../db/models/Swap';
import { SwapUpdateEvent } from '../consts/Enums';

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
    id: string;
    fee: number;
    pair: string;
    invoice: string;
    orderSide: number;
    lockupAddress: string;
    acceptZeroConf: boolean;

    status?: string;
    minerFee?: number;
    routingFee?: number;
    onchainAmount?: number;
    lockupTransactionId?: string;
  }) => {
    return Swap.create(swap);
  }

  public setSwapStatus = async (swap: Swap, status: string) => {
    return swap.update({
      status,
    });
  }

  public setLockupTransactionId = async (swap: Swap, lockupTransactionId: string, onchainAmount: number, confirmed: boolean) => {
    return swap.update({
      onchainAmount,
      lockupTransactionId,
      status: confirmed ? SwapUpdateEvent.TransactionConfirmed : SwapUpdateEvent.TransactionMempool,
    });
  }

  public setInvoicePaid = async (swap: Swap, routingFee: number) => {
    return swap.update({
      routingFee,
      status: SwapUpdateEvent.InvoicePaid,
    });
  }

  public setMinerFee = async (swap: Swap, minerFee: number) => {
    return swap.update({
      minerFee,
      status: SwapUpdateEvent.TransactionClaimed,
    });
  }

  public dropTable = async () => {
    return Swap.drop();
  }
}

export default SwapRepository;
