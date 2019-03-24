import Service from '../service/Service';
import DiscordClient from './DiscordClient';
import BoltzClient from '../boltz/BoltzClient';
import { SwapInstance, ReverseSwapInstance, Swap } from '../consts/Database';
import { satoshisToCoins, parseBalances, getFeeSymbol, stringify, getSuccessfulTrades } from '../Utils';

enum Command {
  GetBalance = 'getbalance',
  GetFees = 'getfees',
  SwapInfo = 'swapinfo',
  Help = 'help',
}

type CommandInfo = {
  description: string;
  executor: (args: string[]) => Promise<void>
};

class CommandHandler {
  private commands: Map<string, CommandInfo>;

  constructor(
    private service: Service,
    private boltz: BoltzClient,
    private discord: DiscordClient) {

    this.commands = new Map<string, CommandInfo>([
      [Command.GetBalance, { description: 'gets the balance of the wallet and channels', executor: this.getBalance }],
      [Command.GetFees, { description: 'gets the accumulated fees', executor: this.getFees }],
      [Command.SwapInfo, { description: 'gets all available information about a (reverse) swap', executor: this.swapInfo }],
      [Command.Help, { description: 'gets a list of all available commands', executor: this.help }],
    ]);

    this.discord.on('message', async (message: string) => {
      const args = message.split(' ');

      // Remove the first argument from the array which is the command itself
      const command = args.shift();

      if (command) {
        const commandInfo = this.commands.get(command.toLowerCase());

        if (commandInfo) {
          await commandInfo.executor(args);
          return;
        }
      }

      await this.discord.sendMessage(`Could not find command: *\"${command}\"*. Type **help** for a list of all commands`);
    });
  }

  private getBalance = async () => {
    const balances = await parseBalances(await this.boltz.getBalance());

    let message = 'Balances:';

    balances.forEach((balance, symbol) => {
      // tslint:disable-next-line:prefer-template
      message += `\n\n**${symbol}**\n` +
        `Wallet: ${satoshisToCoins(balance.walletBalance!.totalBalance)} ${symbol}`;

      if (balance.lightningBalance) {
        const { localBalance, remoteBalance } = balance.lightningBalance;

        // tslint:disable-next-line:prefer-template
        message += '\n\nChannels:\n' +
          `  Local: ${satoshisToCoins(localBalance)} ${symbol}\n` +
          `  Remote: ${satoshisToCoins(remoteBalance)} ${symbol}`;
      }
    });

    await this.discord.sendMessage(message);
  }

  private getFees = async () => {
    let message = 'Fees:\n';

    const { swaps, reverseSwaps } = await getSuccessfulTrades(this.service.swapRepository, this.service.reverseSwapRepository);
    const fees = this.getFeeFromSwaps(swaps, reverseSwaps);

    fees.forEach((fee, symbol) => {
      message += `\n**${symbol}**: ${satoshisToCoins(fee)} ${symbol}`;
    });

    await this.discord.sendMessage(message);
  }

  private swapInfo = async (args: string[]) => {
    if (args.length === 0) {
      await this.sendCouldNotFindSwap('');
      return;
    }

    const id = args[0];
    const swap = await this.service.swapRepository.getSwap({
      id,
    });

    if (swap) {
      await this.discord.sendMessage(`Swap ${id}: ${stringify(swap)}`);
      return;
    } else {
      // Query for a reverse swap because there was no normal one found with the specified id
      const reverseSwap = await this.service.reverseSwapRepository.getReverseSwap({
        id,
      });

      if (reverseSwap) {
        await this.discord.sendMessage(`Reverse swap ${id}: ${stringify(reverseSwap)}`);
        return;
      }
    }

    await this.sendCouldNotFindSwap(id);
  }

  private help = async () => {
    let message = 'Commands:\n';

    this.commands.forEach((info, command) => {
      message += `\n**${command}**: ${info.description}`;
    });

    await this.discord.sendMessage(message);
  }

  private getFeeFromSwaps = (swaps: SwapInstance[], reverseSwaps: ReverseSwapInstance[]) => {
    // A map between the symbols of the currencies and the fees collected on that chain
    const fees = new Map<string, number>();

    const getFeeFromSwapMap = (array: Swap[], isReverse: boolean) => {
      array.forEach((swap) => {
        const feeSymbol = getFeeSymbol(swap.pair, swap.orderSide, isReverse);
        const fee = fees.get(feeSymbol);

        if (fee) {
          fees.set(feeSymbol, fee + swap.fee);
        } else {
          fees.set(feeSymbol, swap.fee);
        }
      });
    };

    getFeeFromSwapMap(swaps, false);
    getFeeFromSwapMap(reverseSwaps, true);

    return fees;
  }

  private sendCouldNotFindSwap = async (id: string) => {
    await this.discord.sendMessage(`Could not find swap with id: ${id}`);
  }
}

export default CommandHandler;
