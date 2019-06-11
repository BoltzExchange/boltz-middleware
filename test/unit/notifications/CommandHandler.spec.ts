import { expect } from 'chai';
import { instance, mock, anything, when, verify, anyString } from 'ts-mockito';
import { wait } from '../../Utils';
import Logger from '../../../lib/Logger';
import Database from '../../../lib/db/Database';
import Service from '../../../lib/service/Service';
import BoltzClient from '../../../lib/boltz/BoltzClient';
import { OutputType } from '../../../lib/proto/boltzrpc_pb';
import { SwapUpdateEvent } from '../../../lib/consts/Enums';
import { stringify, satoshisToCoins } from '../../../lib/Utils';
import PairRepository from '../../../lib/service/PairRepository';
import SwapRepository from '../../../lib/service/SwapRepository';
import BackupScheduler from '../../../lib/backup/BackupScheduler';
import DiscordClient from '../../../lib/notifications/DiscordClient';
import CommandHandler from '../../../lib/notifications/CommandHandler';
import ReverseSwapRepository from '../../../lib/service/ReverseSwapRepository';

describe('CommandHandler', () => {
  const getRandomNumber = () => Math.floor(Math.random() * 10000);

  let sendMessage: (message: string) => {};

  const discordMock = mock(DiscordClient);
  when(discordMock.on('message', anything())).thenCall((_, callback) => {
    sendMessage = callback;
  });
  const discordClient = instance(discordMock);

  const database = new Database(Logger.disabledLogger, ':memory:');

  const pairRepository = new PairRepository();
  const swapRepository = new SwapRepository();
  const reverseSwapRepository = new ReverseSwapRepository();

  const serviceMock = mock(Service);
  when(serviceMock.swapRepository).thenReturn(swapRepository);
  when(serviceMock.reverseSwapRepository).thenReturn(reverseSwapRepository);
  const service = instance(serviceMock);
  service.allowReverseSwaps = true;

  const btcBalance = {
    walletBalance: {
      totalBalance: getRandomNumber(),
      confirmedBalance: getRandomNumber(),
      unconfirmedBalance: getRandomNumber(),
    },

    lightningBalance: {
      walletBalance: {
        totalBalance: getRandomNumber(),
        confirmedBalance: getRandomNumber(),
        unconfirmedBalance: getRandomNumber(),
      },

      channelBalance: {
        localBalance: getRandomNumber(),
        remoteBalance: getRandomNumber(),
      },
    },
  };

  const newAddress = 'bcrt1qymqsjl5qre2zc94wd04nd27p5vkvxqge7f0a8k';

  const boltzMock = mock(BoltzClient);
  when(boltzMock.getBalance()).thenResolve({
    balancesMap: [
      ['BTC', btcBalance],
    ],
  });
  when(boltzMock.newAddress(anyString(), anything())).thenResolve({
    address: newAddress,
  });
  const boltzClient = instance(boltzMock);

  const backupMock = mock(BackupScheduler);
  when(backupMock.uploadDatabases(anything())).thenResolve();
  const backupScheduler = instance(backupMock);

  const commandHandler = new CommandHandler(
    Logger.disabledLogger,
    discordClient,
    service,
    boltzClient,
    backupScheduler,
  );

  before(async () => {
    await database.init();

    await pairRepository.addPair({
      base: 'LTC',
      quote: 'BTC',
    });

    await Promise.all([
      swapRepository.addSwap(swapExample),
      reverseSwapRepository.addReverseSwap(reverseSwapExample),
    ]);
  });

  it('should not respond to messages that are no commands', async () => {
    sendMessage('clearly not a command');
    await wait(5);
    verify(discordMock.sendMessage(anyString())).never();
  });

  it('should deal with commands that are not all lower case', async () => {
    sendMessage('hElP');
    await wait(5);
    verify(discordMock.sendMessage(anyString())).once();
  });

  it('should get help message', async () => {
    sendMessage('help');
    await wait(5);
    verify(discordMock.sendMessage(anyString())).twice();
  });

  it('should get accumulated fees', async () => {
    sendMessage('getfees');

    // Calculating the fees takes a little longer than the other commands
    await wait(50);
    verify(discordMock.sendMessage(
      `Fees:\n\n**BTC**: ${satoshisToCoins(swapExample.fee + reverseSwapExample.fee)} BTC`,
    )).once();
  });

  it('should get balances', async () => {
    sendMessage('getbalance');
    await wait(5);

    const { walletBalance, lightningBalance } = btcBalance;

    verify(discordMock.sendMessage(
      // tslint:disable-next-line: prefer-template
      'Balances:\n\n' +
      `**BTC**\nWallet: ${satoshisToCoins(walletBalance.totalBalance)} BTC\n\n` +
      'LND:\n' +
      `  Wallet: ${satoshisToCoins(lightningBalance.walletBalance.totalBalance)} BTC\n\n` +
      '  Channels:\n' +
      `    Local: ${satoshisToCoins(lightningBalance.channelBalance.localBalance)} BTC\n` +
      `    Remote: ${satoshisToCoins(lightningBalance.channelBalance.remoteBalance)} BTC`,
    )).once();
  });

  it('should get information about (reverse) swaps', async () => {
    sendMessage(`swapinfo ${swapExample.id}`);
    await wait(10);
    verify(discordMock.sendMessage(`Swap ${swapExample.id}:\n\`\`\`${stringify(await swapRepository.getSwap({ id: swapExample.id }))}\`\`\``)).once();

    sendMessage(`swapinfo ${reverseSwapExample.id}`);
    await wait(10);

    // tslint:disable-next-line: prefer-template
    verify(discordMock.sendMessage(`Reverse swap ${reverseSwapExample.id}:\n\`\`\``
      + `${stringify(await reverseSwapRepository.getReverseSwap({ id: reverseSwapExample.id }))}\`\`\``)).once();

    const errorMessage = 'Could not find swap with id: ';

    // Send an error if there is no id provided
    sendMessage('swapinfo');
    verify(discordMock.sendMessage(errorMessage)).once();

    // Send an error if the swap cannot be found
    const id = 'notFound';
    sendMessage(`swapinfo ${id}`);

    await wait(10);

    verify(discordMock.sendMessage(`${errorMessage}${id}`)).once();
  });

  it('should get statistics', async () => {
    sendMessage('getstats');
    await wait(50);

    verify(discordMock.sendMessage(`\`\`\`${stringify({
      failureRates: {
        swaps: 0,
        reverseSwaps: 0,
      },
      volume: {
        BTC: 0.02,
      },
      trades: {
        'LTC/BTC': 2,
      },
    },
    )}\`\`\``)).once();
  });

  it('should parse output types', () => {
    const getOutputType = commandHandler['getOutputType'];

    expect(getOutputType('bech32')).to.be.equal(OutputType.BECH32);
    expect(getOutputType('compatibility')).to.be.equal(OutputType.COMPATIBILITY);
    expect(getOutputType('legacy')).to.be.equal(OutputType.LEGACY);

    expect(getOutputType('BECH32')).to.be.equal(OutputType.BECH32);

    const notFound = 'not found';

    expect(getOutputType.bind(getOutputType, notFound)).to.throw(`could not find output type: ${notFound}`);
  });

  it('should generate new addresses', async () => {
    sendMessage('newaddress BTC');
    await wait(5);
    verify(boltzMock.newAddress('BTC', OutputType.COMPATIBILITY)).once();
    verify(discordMock.sendMessage(newAddress)).once();

    sendMessage('newaddress BTC bech32');
    await wait(5);
    verify(boltzMock.newAddress('BTC', OutputType.BECH32)).once();
    verify(discordMock.sendMessage(newAddress)).twice();

    // Send an error if no currency is specified
    sendMessage('newaddress');
    await wait(5);
    verify(discordMock.sendMessage('Could not generate address: no currency was specified')).once();
  });

  it('should toggle reverse swaps', async () => {
    sendMessage('togglereverse');
    await wait(5);
    expect(service.allowReverseSwaps).to.be.false;
    verify(discordMock.sendMessage('Disabled reverse swaps')).once();

    sendMessage('togglereverse');
    await wait(5);
    expect(service.allowReverseSwaps).to.be.true;
    verify(discordMock.sendMessage('Enabled reverse swaps')).once();
  });

  it('should do a database backup', async () => {
    sendMessage('backup');
    await wait(5);
    verify(discordMock.sendMessage('Uploaded backup of databases')).once();
  });

  after(async () => {
    await Promise.all([
      swapRepository.dropTable(),
      reverseSwapRepository.dropTable(),
    ]);

    await pairRepository.dropTable();
    await database.close();
  });
});

export const swapExample = {
  id: '123456',

  fee: 100,
  orderSide: 0,
  minerFee: 306,
  routingFee: 1,
  pair: 'LTC/BTC',
  onchainAmount: 1000000,
  status: SwapUpdateEvent.TransactionClaimed,
  lockupAddress: 'bcrt1q4fgsuxk4q0uhmqm4hlhwz2kv4k374f5ta2dqn2',
  lockupTransactionId: '6071400d052ffd911f47537aba80500d52f67077a8522ec6915c128228f71a69',
  // tslint:disable-next-line: max-line-length
  invoice: 'lnbcrt10u1pwd0ll7pp5ulhj6g7cxhsnv7daksah2tcegr7crqrkym5lxl96kxn450wj9p5sdqqcqzpghwrktsemktcs8u367pls8t5htnhvh8l5x00zpu2sjq0lmag5zzw58mf3hfw02zj3ucuw7n52t2cajk7d88wzfh9ydwgtl9yz7gu00fqqzku5uy',
};

export const reverseSwapExample = {
  id: '654321',

  fee: 200,
  orderSide: 1,
  minerFee: 306,
  pair: 'LTC/BTC',
  onchainAmount: 1000000,
  status: SwapUpdateEvent.InvoiceSettled,
  preimage: '19633406642926291B51625F7E5F61126A',
  transactionId: '6071400d052ffd911f47537aba80500d52f67077a8522ec6915c128228f71a69',
  // tslint:disable-next-line: max-line-length
  invoice: 'lnbcrt20u1pwdsqqppp5dhevzcnd2xrdwuyzv2s342mcwzuukjqlrkwyvyyda66hukkhrhwsdqqcqzpg9y9m249r5m6djquw5jd8klfsehgfpsn3f88hzktcmv6k6p65h2hra9hqj5xrhh27dxktr0wtmn7f8wk4zg2gprnl5zgsas45v7jq5hcqdr8n5a',
};
