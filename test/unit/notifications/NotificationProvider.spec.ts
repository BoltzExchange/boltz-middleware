import { mock, anything, when, instance, verify } from 'ts-mockito';
import Logger from '../../../lib/Logger';
import Swap from '../../../lib/db/models/Swap';
import Service from '../../../lib/service/Service';
import BoltzClient from '../../../lib/boltz/BoltzClient';
import ReverseSwap from '../../../lib/db/models/ReverseSwap';
import BackupScheduler from '../../../lib/backup/BackupScheduler';
import DiscordClient from '../../../lib/notifications/DiscordClient';
import { swapExample, reverseSwapExample } from './CommandHandler.spec';
import NotificationProvider from '../../../lib/notifications/NotificationProvider';
import { wait } from '../../Utils';
import { getAmountOfInvoice, satoshisToCoins } from '../../../lib/Utils';
import { SwapUpdateEvent } from '../../../lib/consts/Enums';

describe('NotificationProvider', () => {
  const swapMock = mock(Swap);
  when(swapMock.id).thenReturn(swapExample.id);
  when(swapMock.fee).thenReturn(swapExample.fee);
  when(swapMock.pair).thenReturn(swapExample.pair);
  when(swapMock.status).thenReturn(swapExample.status);
  when(swapMock.invoice).thenReturn(swapExample.invoice);
  when(swapMock.minerFee).thenReturn(swapExample.minerFee);
  when(swapMock.orderSide).thenReturn(swapExample.orderSide);
  when(swapMock.routingFee).thenReturn(swapExample.routingFee);
  when(swapMock.onchainAmount).thenReturn(swapExample.onchainAmount);
  when(swapMock.lockupAddress).thenReturn(swapExample.lockupAddress);
  when(swapMock.lockupTransactionId).thenReturn(swapExample.lockupTransactionId);

  const swap = instance(swapMock);

  const mockReverseSwap = (status: SwapUpdateEvent) => {
    const reverseSwapMock = mock(ReverseSwap);

    when(reverseSwapMock.status).thenReturn(status);

    when(reverseSwapMock.id).thenReturn(reverseSwapExample.id);
    when(reverseSwapMock.fee).thenReturn(reverseSwapExample.fee);
    when(reverseSwapMock.pair).thenReturn(reverseSwapExample.pair);
    when(reverseSwapMock.invoice).thenReturn(reverseSwapExample.invoice);
    when(reverseSwapMock.preimage).thenReturn(reverseSwapExample.preimage);
    when(reverseSwapMock.minerFee).thenReturn(reverseSwapExample.minerFee);
    when(reverseSwapMock.orderSide).thenReturn(reverseSwapExample.orderSide);
    when(reverseSwapMock.onchainAmount).thenReturn(reverseSwapExample.onchainAmount);
    when(reverseSwapMock.transactionId).thenReturn(reverseSwapExample.transactionId);

    return instance(reverseSwapMock);
  };

  let emitSwapSuccessful: (swap: Swap | ReverseSwap) => {};
  let emitSwapFailed: (swap: Swap | ReverseSwap, reason: string) => {};

  const serviceMock = mock(Service);
  when(serviceMock.on('swap.successful', anything())).thenCall((_, callback) => {
    emitSwapSuccessful = callback;
  });
  when(serviceMock.on('swap.failed', anything())).thenCall((_, callback) => {
    emitSwapFailed = callback;
  });
  const service = instance(serviceMock);

  const boltzMock = mock(BoltzClient);
  when(boltzMock.getInfo()).thenResolve({
    version: '',
    chainsMap: [],
  });
  when(boltzMock.getBalance()).thenResolve({
    balancesMap: [],
  });
  const boltzClient = instance(boltzMock);

  const backupMock = mock(BackupScheduler);
  const backupScheduler = instance(backupMock);

  const discordMock = mock(DiscordClient);
  const discordClient = instance(discordMock);

  const notificationProvider = new NotificationProvider(
    Logger.disabledLogger,
    service,
    boltzClient,
    backupScheduler,
    {
      token: '',
      interval: 60,
      prefix: 'test',
      channel: 'test',
    },
    [],
  );

  notificationProvider['discord'] = discordClient;

  it('should init', async () => {
    await notificationProvider.init();

    verify(discordMock.sendMessage('Started Boltz instance')).once();

    verify(boltzMock.getInfo()).once();
    verify(boltzMock.getBalance()).once();
  });

  it('should send a notification after successful (reverse) swaps', async () => {
    emitSwapSuccessful(swap);
    await wait(5);

    verify(discordMock.sendMessage(
      // tslint:disable-next-line: prefer-template
      '**Swap**\n\n' +
      `ID: ${swap.id}\n` +
      `Pair: ${swap.pair}\n` +
      'Order side: buy\n' +
      `Onchain amount: ${satoshisToCoins(swap.onchainAmount!)} BTC\n` +
      `Lightning amount: ${satoshisToCoins(getAmountOfInvoice(swap.invoice))} LTC\n` +
      `Fees earned: ${satoshisToCoins(swap.fee)} BTC\n` +
      `Miner fees: ${satoshisToCoins(swap.minerFee!)} BTC\n` +
      `Routing fees: ${swap.routingFee! / 1000} litoshi`,
    )).once();

    const reverseSwap = mockReverseSwap(reverseSwapExample.status);

    emitSwapSuccessful(reverseSwap);
    await wait(5);

    verify(discordMock.sendMessage(
      // tslint:disable-next-line: prefer-template
      '**Reverse swap**\n\n' +
      `ID: ${reverseSwap.id}\n` +
      `Pair: ${reverseSwap.pair}\n` +
      'Order side: sell\n' +
      `Onchain amount: ${satoshisToCoins(reverseSwap.onchainAmount!)} BTC\n` +
      `Lightning amount: ${satoshisToCoins(getAmountOfInvoice(reverseSwap.invoice))} LTC\n` +
      `Fees earned: ${satoshisToCoins(reverseSwap.fee)} LTC\n` +
      `Miner fees: ${satoshisToCoins(reverseSwap.minerFee!)} BTC`,
    ));
  });

  it('should send a notification after failed (reverse) swaps', async () => {
    const failureReason = 'because';

    emitSwapFailed(swap, failureReason);
    await wait(5);

    verify(discordMock.sendMessage(
      // tslint:disable-next-line: prefer-template
      `**Swap failed: ${failureReason}**\n\n` +
      `ID: ${swap.id}\n` +
      `Pair: ${swap.pair}\n` +
      'Order side: buy\n' +
      `Onchain amount: ${satoshisToCoins(swap.onchainAmount!)} BTC\n` +
      `Lightning amount: ${satoshisToCoins(getAmountOfInvoice(swap.invoice))} LTC\n` +
      `Invoice: ${swap.invoice}`,
    )).once();

    const reverseSwap = mockReverseSwap(SwapUpdateEvent.TransactionRefunded);

    emitSwapFailed(reverseSwap, failureReason);
    await wait(5);

    verify(discordMock.sendMessage(
      // tslint:disable-next-line: prefer-template
      `**Reverse swap failed: ${failureReason}**\n\n` +
      `ID: ${reverseSwap.id}\n` +
      `Pair: ${reverseSwap.pair}\n` +
      'Order side: sell\n' +
      `Onchain amount: ${satoshisToCoins(reverseSwap.onchainAmount!)} BTC\n` +
      `Lightning amount: ${satoshisToCoins(getAmountOfInvoice(reverseSwap.invoice))} LTC\n` +
      `Miner fees: ${satoshisToCoins(reverseSwap.minerFee)} BTC`,
    )).once();
  });

  after(() => {
    clearInterval(notificationProvider['timer']);
  });
});
