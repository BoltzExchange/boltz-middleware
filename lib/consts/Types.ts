import { SwapUpdateEvent } from './Enums';

export type Error = {
  message: string;
  code: string;
};

export type SwapUpdate = {
  event: SwapUpdateEvent,

  preimage?: string;
};
