import Logger from '../Logger';
import SlackClient from './SlackClient';
import BoltzClient from '../boltz/BoltzClient';
import { Balance, OutputType } from '../proto/boltzrpc_pb';
import { minutesToMilliseconds, satoshisToWholeCoins } from '../Utils';

type NotificationConfig = {
  name: string;
  interval: number;

  token: string;
  channel: string;
};

type CurrencyConfig = {
  symbol: string;

  maxSwapAmount: number;
  minSwapAmount: number;

  minWalletBalance: number;
  minChannelBalance: number;
};

class NotificationProvider {
  private slack: SlackClient;
  private timer!: NodeJS.Timer;

  // These Sets contains the symbols for which an alert notification was sent
  private walletAlerts = new Set<string>();
  private channelAlerts = new Set<string>();

  constructor(
    private logger: Logger,
    private boltz: BoltzClient,
    private config: NotificationConfig,
    private currencies: CurrencyConfig[]) {

    this.slack = new SlackClient(config.token, config.channel, config.name);
    this.listenCommands();
  }

  public init = async () => {
    try {
      await this.slack.init();
      await this.slack.listenToMessages();

      await this.slack.sendMessage('Started Boltz instance');
      this.logger.verbose('Connected to Slack');

      await this.checkBalances();

      this.logger.silly(`Checking balances every ${this.config.interval} minutes`);

      this.timer = setInterval(async () => {
        await this.checkBalances();
      }, minutesToMilliseconds(this.config.interval));
    } catch (error) {
      this.logger.warn(`Could not connect to Slack: ${error}`);
    }
  }

  public disconnect = () => {
    clearInterval(this.timer);
  }

  private checkBalances = async () => {
    const balances = await this.parseBalances();

    for (const currency of this.currencies) {
      const balance = balances.get(currency.symbol);

      if (balance) {
        const { channelBalance, walletBalance } = balance;

        await this.checkBalance(currency.symbol, false, currency.minChannelBalance, channelBalance);
        await this.checkBalance(currency.symbol, true, currency.minWalletBalance, walletBalance!.totalBalance);
      }
    }
  }

  private checkBalance = async (currency: string, isWallet: boolean, expectedBalance: number, actualBalance: number) => {
    const set = isWallet ? this.walletAlerts : this.channelAlerts;
    const sentAlert = set.has(currency);

    if (sentAlert) {
      if (actualBalance > expectedBalance) {
        set.delete(currency);
        await this.sendRelief(currency, isWallet, expectedBalance, actualBalance);
      }
    } else {
      if (actualBalance < expectedBalance) {
        set.add(currency);
        await this.sendAlert(currency, isWallet, expectedBalance, actualBalance);
      }
    }
  }

  private listenCommands = () => {
    this.slack.on('message', async (message: string) => {
      switch (message.toLowerCase()) {
        case 'getbalance':
          await this.sendBalance();
          break;
      }
    });
  }

  private sendAlert = async (currency: string, isWallet: boolean, expectedBalance: number, actualBalance: number) => {
    const { expected, actual } = this.formatBalances(expectedBalance, actualBalance);
    const missing = satoshisToWholeCoins(expectedBalance - actualBalance);

    const { address } = await this.boltz.newAddress(currency, OutputType.COMPATIBILITY);

    const walletName = this.getWalletName(isWallet);

    this.logger.warn(`${currency} ${walletName} balance is less than ${expectedBalance}: ${actualBalance}`);

    // tslint:disable-next-line:prefer-template
    let slackMessage = ':rotating_light: *Alert* :rotating_light:\n\n' +
      `The ${currency} ${walletName} balance of ${actual} ${currency} is less than expected ${expected} ${currency}\n\n` +
      `Funds missing: *${missing} ${currency}*`;

    if (isWallet) {
      slackMessage += `\nDeposit address: *${address}*`;
    }

    await this.slack.sendMessage(slackMessage);
  }

  private sendRelief = async (currency: string, isWallet: boolean, expectedBalance: number, actualBalance: number) => {
    const { expected, actual } = this.formatBalances(expectedBalance, actualBalance);
    const walletName = this.getWalletName(isWallet);

    this.logger.info(`${currency} ${walletName} balance is more than expected ${expectedBalance} again: ${actualBalance}`);

    await this.slack.sendMessage(
      `The ${currency} ${walletName} balance of ${actual} ${currency} is more than expected ${expected} ${currency} again`,
    );
  }

  private sendBalance = async () => {
    const balances = await this.boltz.getBalance();

    let message = 'Balances:';

    balances.balancesMap.forEach((value) => {
      const symbol = value[0];
      const balance = value[1];

      // tslint:disable-next-line:prefer-template
      message += `\n\n*${symbol}*\n` +
        `Wallet: ${satoshisToWholeCoins(balance.walletBalance!.totalBalance)} ${symbol}\n` +
        `Channels: ${satoshisToWholeCoins(balance.channelBalance)} ${symbol}`;
    });

    await this.slack.sendMessage(message);
  }

  private formatBalances = (expectedBalance: number, actualBalance: number) => {
    return {
      expected: satoshisToWholeCoins(expectedBalance),
      actual: satoshisToWholeCoins(actualBalance),
    };
  }

  private getWalletName = (isWallet: boolean) => {
    return isWallet ? 'wallet' : 'channel';
  }

  private parseBalances = async () => {
    const balance = await this.boltz.getBalance();
    const balances = new Map<string, Balance.AsObject>();

    balance.balancesMap.forEach((balance) => {
      balances.set(balance[0], balance[1]);
    });

    return balances;
  }
}

export default NotificationProvider;
export { NotificationConfig, CurrencyConfig };
