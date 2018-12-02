import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType } from '../proto/boltzrpc_pb';

class Service {
  constructor(private boltz: BoltzClient) {}

  /**
   * Gets a hex encoded transaction from a transaction hash on the specified network
   */
  public getTransaction = (currency: string, transactionHash: string) => {
    return this.boltz.getTransaction(currency, transactionHash);
  }

  /**
   * Broadcasts a hex encoded transaction on the specified network
   */
  public broadcastTransaction = (currency: string, transactionHex: string) => {
    return this.boltz.broadcastTransaction(currency, transactionHex);
  }

  /**
   * Creates a new Swap from the chain to Lightning
   */
  public createSwap = (pairId: string, orderSide: OrderSide, invoice: string, refundPublicKey: string) => {
    return this.boltz.createSwap(pairId, orderSide, invoice, refundPublicKey, OutputType.BECH32);
  }
}

export default Service;
