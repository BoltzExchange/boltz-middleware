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

  private localBalanceAlerts = new Set<string>();
  private remoteBalanceAlerts = new Set<string>();

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
    this.listenToDiscord();
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
        const { symbol, minWalletBalance, minLocalBalance, minRemoteBalance } = currency;

        await this.checkBalance(symbol, this.walletAlerts, balance.walletBalance!.totalBalance, minWalletBalance, true);

        if (balance.lightningBalance) {
          const { localBalance, remoteBalance } = balance.lightningBalance;

          await this.checkBalance(symbol, this.localBalanceAlerts, localBalance, minLocalBalance, false, true);
          await this.checkBalance(symbol, this.remoteBalanceAlerts, remoteBalance, minRemoteBalance, false, false);
        }
      }
    }
  }

  private checkBalance = async (currency: string, set: Set<string>, balance: number, threshold: number, isWallet: boolean, isLocal?: boolean) => {
    const sentAlert = set.has(currency);

    if (sentAlert) {
      if (balance > threshold) {
        set.delete(currency);
        await this.sendRelief(currency, balance, threshold, isWallet, isLocal);
      }
    } else {
      if (balance <= threshold) {
        set.add(currency);
        await this.sendAlert(currency, balance, threshold, isWallet, isLocal);
      }
    }
  }

  private listenToDiscord = () => {
    this.discord.on('error', (error) => {
      this.logger.warn(`Discord client threw: ${error.message}`);
    });
  }

  private listenToBoltz = () => {
    this.boltz.on('status.updated', async (status) => {
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

  private sendAlert = async (currency: string, balance: number, threshold: number, isWallet: boolean, isLocal?: boolean) => {
    const { actual, expected } = this.formatBalances(balance, threshold);
    const missing = satoshisToCoins(threshold - balance);

    const balanceName = this.getBalanceName(isWallet, isLocal);

    this.logger.warn(`${currency} ${balanceName} balance is less than ${threshold}: ${balance}`);

    // tslint:disable-next-line:prefer-template
    let message = ':rotating_light: **Alert** :rotating_light:\n\n' +
      `The ${currency} ${balanceName} balance of ${actual} ${currency} is less than expected ${expected} ${currency}\n\n` +
      `Funds missing: **${missing} ${currency}**`;

    if (isWallet) {
      const { address } = await this.boltz.newAddress(currency, OutputType.COMPATIBILITY);
      message += `\nDeposit address: **${address}**`;
    }

    await this.discord.sendMessage(message);
  }

  private sendRelief = async (currency: string, balance: number, threshold: number, isWallet: boolean, isLocal?: boolean) => {
    const { actual, expected } = this.formatBalances(balance, threshold);
    const balanceName = this.getBalanceName(isWallet, isLocal);

    this.logger.info(`${currency} ${balanceName} balance is more than expected ${threshold} again: ${balance}`);

    await this.discord.sendMessage(
      `The ${currency} ${balanceName} balance of ${actual} ${currency} is more than expected ${expected} ${currency} again`,
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

  private formatBalances = (balance: number, threshold: number) => {
    return {
      actual: satoshisToCoins(balance),
      expected: satoshisToCoins(threshold),
    };
  }

  private getBalanceName = (isWallet: boolean, isLocal?: boolean) => {
    if (isWallet) {
      return 'wallet';
    } else {
      return isLocal ? 'local' : 'remote';
    }
  }
}

export default NotificationProvider;
export { NotificationConfig };
