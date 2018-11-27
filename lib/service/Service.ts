import BoltzClient from '../boltz/BoltzClient';
import { OrderSide, OutputType } from '../proto/boltzrpc_pb';

// TODO: error handling
class Service {
  constructor(private boltz: BoltzClient) {}

  /**
   * Creates a new Swap from the chain to Lightning
   */
  public createSwap = (pairId: string, orderSide: OrderSide, invoice: string, refundPublicKey: string) => {
    return this.boltz.createSwap(pairId, orderSide, invoice, refundPublicKey, OutputType.BECH32);
  }
}

export default Service;
