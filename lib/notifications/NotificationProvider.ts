import Logger from '../Logger';
import DiscordClient, { Command } from './DiscordClient';
import { Balance, OutputType } from '../proto/boltzrpc_pb';
import BoltzClient, { ConnectionStatus } from '../boltz/BoltzClient';
import { minutesToMilliseconds, satoshisToWholeCoins } from '../Utils';

type NotificationConfig = {
  token: string;
  channel: string;

  prefix: string;
  interval: number;
};

type CurrencyConfig = {
  symbol: string;

  maxSwapAmount: number;
  minSwapAmount: number;

  minWalletBalance: number;
  minChannelBalance: number;
};

class NotificationProvider {
  private timer!: NodeJS.Timer;
  private discord: DiscordClient;

  // These Sets contain the symbols for which an alert notification was sent
  private walletAlerts = new Set<string>();
  private channelAlerts = new Set<string>();

  private disconnected = new Set<string>();

  constructor(
    private logger: Logger,
    private boltz: BoltzClient,
    private config: NotificationConfig,
    private currencies: CurrencyConfig[]) {

    this.discord = new DiscordClient(
      config.token,
      config.channel,
      config.prefix,
    );

    this.listenToBoltz();
    this.listenForCommands();
  }

  public init = async () => {
    try {
      await this.discord.init();

      await this.discord.sendMessage('Started Boltz instance');
      this.logger.verbose('Connected to Discord');

      const check = async () => {
        await this.checkConnections();
        await this.checkBalances();
      };

      await check();

      this.logger.debug(`Checking balances and connection status every ${this.config.interval} minutes`);

      this.timer = setInterval(async () => {
        await check();
      }, minutesToMilliseconds(this.config.interval));
    } catch (error) {
      this.logger.warn(`Could not connect to Discord: ${error}`);
    }
  }

  public disconnect = () => {
    clearInterval(this.timer);
  }

  private checkConnections = async () => {
    const info = await this.boltz.getInfo();

    info.chainsMap.forEach(async ([symbol, chain]) => {
      await this.checkConnection(`${symbol} node`, chain.chain);
      await this.checkConnection(`${symbol} LND`, chain.lnd);
    });
  }

  private checkConnection = async (service: string, object: { error: string } | undefined) => {
    if (object) {
      if (object.error === '') {
        if (this.disconnected.has(service)) {
          this.disconnected.delete(service);
          await this.sendReconnected(service);
        }

        return;
      }
    }

    if (!this.disconnected.has(service)) {
      this.disconnected.add(service);
      await this.sendLostConnection(service);
    }
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

  private listenToBoltz = () => {
    const service = 'backend';

    this.boltz.on('status.updated', async (status: ConnectionStatus) => {
      switch (status) {
        case ConnectionStatus.Connected:
          if (this.disconnected.has(service)) {
            this.disconnected.delete(service);
            await this.sendReconnected('backend');
          }
          break;

        case ConnectionStatus.Disconnected:
          if (!this.disconnected.has(service)) {
            this.disconnected.add(service);
            await this.sendLostConnection('backend');
          }
          break;
      }
    });
  }

  private listenForCommands = () => {
    this.discord.on('command', async (command: Command) => {
      switch (command) {
        case Command.GetBalance:
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
    let message = ':rotating_light: **Alert** :rotating_light:\n\n' +
      `The ${currency} ${walletName} balance of ${actual} ${currency} is less than expected ${expected} ${currency}\n\n` +
      `Funds missing: **${missing} ${currency}**`;

    if (isWallet) {
      message += `\nDeposit address: **${address}**`;
    }

    await this.discord.sendMessage(message);
  }

  private sendRelief = async (currency: string, isWallet: boolean, expectedBalance: number, actualBalance: number) => {
    const { expected, actual } = this.formatBalances(expectedBalance, actualBalance);
    const walletName = this.getWalletName(isWallet);

    this.logger.info(`${currency} ${walletName} balance is more than expected ${expectedBalance} again: ${actualBalance}`);

    await this.discord.sendMessage(
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
      message += `\n\n**${symbol}**\n` +
        `Wallet: ${satoshisToWholeCoins(balance.walletBalance!.totalBalance)} ${symbol}\n` +
        `Channels: ${satoshisToWholeCoins(balance.channelBalance)} ${symbol}`;
    });

    await this.discord.sendMessage(message);
  }

  private sendLostConnection = async (service: string) => {
    await this.discord.sendMessage(`**Lost connection to ${service}**`);
  }

  private sendReconnected = async (service: string) => {
    await this.discord.sendMessage(`Reconnected to ${service}`);
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
