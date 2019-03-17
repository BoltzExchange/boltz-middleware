import Logger from '../Logger';
import Service from '../service/Service';
import DiscordClient from './DiscordClient';
import CommandHandler from './CommandHandler';
import { CurrencyConfig } from '../consts/Types';
import { SwapUpdateEvent } from '../consts/Enums';
import { OutputType, OrderSide } from '../proto/boltzrpc_pb';
import BoltzClient, { ConnectionStatus } from '../boltz/BoltzClient';
import { SwapInstance, ReverseSwapInstance } from '../consts/Database';
import { minutesToMilliseconds, satoshisToCoins, splitPairId, parseBalances, getFeeSymbol } from '../Utils';

type NotificationConfig = {
  token: string;
  channel: string;

  prefix: string;
  interval: number;
};

class NotificationProvider {
  private readonly backendName = 'backend';

  private timer!: NodeJS.Timer;
  private discord: DiscordClient;

  // These Sets contain the symbols for which an alert notification was sent
  private walletAlerts = new Set<string>();
  private channelAlerts = new Set<string>();

  private disconnected = new Set<string>();

  constructor(
    private logger: Logger,
    private service: Service,
    private boltz: BoltzClient,
    private config: NotificationConfig,
    private currencies: CurrencyConfig[]) {

    this.discord = new DiscordClient(
      config.token,
      config.channel,
      config.prefix,
    );

    this.listenToBoltz();
    this.listenToService();

    new CommandHandler(
      this.service,
      this.boltz,
      this.discord,
    );
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
    const balances = await parseBalances(await this.boltz.getBalance());

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
    this.boltz.on('status.updated', async (status: ConnectionStatus) => {
      switch (status) {
        case ConnectionStatus.Connected:
          if (this.disconnected.has(this.backendName)) {
            this.disconnected.delete(this.backendName);
            await this.sendReconnected(this.backendName);
          }
          break;

        case ConnectionStatus.Disconnected:
          if (!this.disconnected.has(this.backendName)) {
            this.disconnected.add(this.backendName);
            await this.sendLostConnection(this.backendName);
          }
          break;
      }
    });
  }

  private listenToService = () => {
    this.service.on('swap.successful', async (swap) => {
      await this.sendSwapSuccessful(swap);
    });
  }

  private sendAlert = async (currency: string, isWallet: boolean, expectedBalance: number, actualBalance: number) => {
    const { expected, actual } = this.formatBalances(expectedBalance, actualBalance);
    const missing = satoshisToCoins(expectedBalance - actualBalance);

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

  private sendSwapSuccessful = async (swap: SwapInstance | ReverseSwapInstance) => {
    const isReverse = swap.status === SwapUpdateEvent.InvoiceSettled;
    const feeSymbol = getFeeSymbol(swap.pair, swap.orderSide, isReverse);

    const getSwapDirection = (): string => {
      let { base, quote } = splitPairId(swap.pair);

      // Switch the symbols if the swap was a sell order
      if (swap.orderSide === OrderSide.SELL) {
        [base, quote] = [quote, base];
      }

      let direction: string;

      if (isReverse) {
        direction = `Lightning ${quote} to onchain ${base}`;
      } else {
        direction = `onchain ${quote} to Lightning ${base}`;
      }

      return direction;
    };

    const message = `Swapped ${getSwapDirection()} and earned ${satoshisToCoins(swap.fee)} ${feeSymbol} in fees`;

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
      expected: satoshisToCoins(expectedBalance),
      actual: satoshisToCoins(actualBalance),
    };
  }

  private getWalletName = (isWallet: boolean) => {
    return isWallet ? 'wallet' : 'channel';
  }
}

export default NotificationProvider;
export { NotificationConfig };
