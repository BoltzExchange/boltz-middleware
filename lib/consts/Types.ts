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

  maxSwapAmount: number;
  minSwapAmount: number;

  minWalletBalance: number;
  minChannelBalance: number;
};
