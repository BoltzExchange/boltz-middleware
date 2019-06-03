import Logger from '../Logger';
import { PairConfig } from '../consts/Types';
import BoltzClient from '../boltz/BoltzClient';
import { OrderSide } from '../proto/boltzrpc_pb';
import { mapToObject, getPairId, feeMapToObject, stringify, getChainCurrency, splitPairId } from '../Utils';

class FeeProvider {
  // A map between the symbols of the pairs and their percentage fees
  public percentageFees = new Map<string, number>();

  public static transactionSizes = {
    normalClaim: 140,

    reverseLockup: 153,
    reverseClaim: 138,
  };

  constructor(private logger: Logger, private boltz: BoltzClient) {}

  public init = (pairs: PairConfig[]) => {
    pairs.forEach((pair) => {
      // Set the configured fee or fallback to 1% if it is not defined
      const percentage = pair.fee !== undefined ? pair.fee : 1;
      this.percentageFees.set(getPairId(pair), percentage / 100);
    });

    this.logger.debug(`Prepared data for fee estimations: ${stringify(mapToObject(this.percentageFees))}`);
  }

  public getFees = async (
    pair: string,
    rate: number,
    orderSide: OrderSide,
    amount: number,
    isReverse: boolean,
  ) => {
    let percentageFee = this.percentageFees.get(pair) || 0;

    if (percentageFee !== 0) {
      percentageFee = percentageFee * amount * rate;
    }

    const { base, quote } = splitPairId(pair);
    const chainCurrency = getChainCurrency(base, quote, orderSide, isReverse);

    return {
      percentageFee: Math.ceil(percentageFee),
      baseFee: await this.getBaseFee(chainCurrency, isReverse),
    };
  }

  public getBaseFee = async (chainCurrency: string, isReverse: boolean) => {
    const feeReponse = await this.boltz.getFeeEstimation(chainCurrency);
    const feeMap = feeMapToObject(feeReponse.feesMap);

    return this.calculateBaseFee(feeMap[chainCurrency], isReverse);
  }

  private calculateBaseFee = (satPerVbyte: number, isReverse: boolean) => {
    if (isReverse) {
      // The lockup transaction which spends a P2WPKH output (possibly more but we assume a best case scenario here),
      // locks up funds in a P2WSH swap and sends the change back to a P2WKH output has about 153 vbytes
      return satPerVbyte * FeeProvider.transactionSizes.reverseLockup;
    } else {
      // The claim transaction which spends a nested SegWit swap output and
      // sends it to a P2WPKH address has about 140 vbytes
      return satPerVbyte * FeeProvider.transactionSizes.normalClaim;
    }
  }
}

export default FeeProvider;
