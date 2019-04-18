import { SwapUpdateEvent } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type SwapUpdate = {
  event: SwapUpdateEvent,

  preimage?: string;
};

export type CurrencyConfig = {
  symbol: string;

  timeoutBlockNumber: number;

  maxSwapAmount: number;
  minSwapAmount: number;

  minWalletBalance: number;

  minLocalBalance: number;
  minRemoteBalance: number;
};

export type PairConfig = {
  base: string;
  quote: string;

  // Percentage of the amount that will be charged as fee
  fee?: number;

  // If there is a hardcoded rate the CryptoCompare API will not be queried
  rate?: number;
};
