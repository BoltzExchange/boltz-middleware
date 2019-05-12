export enum ClientStatus {
  Connected,
  Disconnected,
}

export enum ErrorCodePrefix {
  General = 0,
  Api = 1,
  Service = 2,
  BoltzClient = 3,
  RateProvider = 4,
}

export enum SwapUpdateEvent {
  InvoicePaid = 'invoice.paid',
  InvoiceSettled = 'invoice.settled',
  InvoiceFailedToPay = 'invoice.failedToPay',

  TransactionClaimed = 'transaction.claimed',
  TransactionRefunded = 'transaction.refunded',
  TransactionConfirmed = 'transaction.confirmed',
}

export enum ServiceWarning {
  ReverseSwapsDisabled = 'reverse.swaps.disabled',
}
