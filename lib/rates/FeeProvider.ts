import Logger from '../Logger';
import { PairConfig } from '../consts/Types';
import BoltzClient from '../boltz/BoltzClient';
import { mapToObject, getPairId, feeMapToObject, stringify } from '../Utils';

class FeeProvider {
  // A map between the symbols of the pairs and their percentage fees
  public percentageFees = new Map<string, number>();

  constructor(private logger: Logger, private boltz: BoltzClient) {}

  public init = (pairs: PairConfig[]) => {
    pairs.forEach((pair) => {
      // Set the configured fee or fallback to 1% if it is not defined
      const percentage = pair.fee !== undefined ? pair.fee : 1;
      this.percentageFees.set(getPairId(pair), percentage / 100);
    });

    this.logger.debug(`Prepared data for fee estimations: ${stringify(mapToObject(this.percentageFees))}`);
  }

  public getFee = async (pair: string, chainCurrency: string, amount: number, isReverse: boolean) => {
    const feeReponse = await this.boltz.getFeeEstimation(chainCurrency);
    const feeMap = feeMapToObject(feeReponse.feesMap);

    const baseFee = this.getBaseFee(feeMap[chainCurrency], isReverse);

    // Multiply the amount with the percentage fee or with 0 if there is no percentage fee for that pair
    const percentageFee = Math.ceil((this.percentageFees.get(pair) || 0) * amount);

    return baseFee + percentageFee;
  }

  private getBaseFee = (satPerVbyte: number, isReverse: boolean) => {
    if (isReverse) {
      // The lockup transaction which spends a P2WPKH output (possibly more but we assume a best case scenario here),
      // locks up funds in a P2WSH swap and sends the change back to a P2WKH output has about 153 vbytes
      return satPerVbyte * 153;
    } else {
      // The claim transaction which spends a nested SegWit swap output and
      // sends it to a bech32 P2WPKH address has about 140 vbytes
      return satPerVbyte * 140;
    }
  }
}

export default FeeProvider;
