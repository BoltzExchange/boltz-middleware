import Service from '../service/Service';
import BoltzClient from '../boltz/BoltzClient';
import { SwapUpdateEvent } from '../consts/Enums';
import DiscordClient, { Command } from './DiscordClient';
import { satoshisToCoins, parseBalances, getFeeSymbol } from '../Utils';
import { SwapInstance, ReverseSwapInstance, Swap } from '../consts/Database';

class CommandHandler {
  constructor(
    private service: Service,
    private boltz: BoltzClient,
    private discord: DiscordClient) {

    this.discord.on('command', async (command: Command) => {
      switch (command) {
        case Command.GetBalance:
          await this.sendBalance();
          break;

        case Command.GetFees:
          await this.sendFees();
          break;
      }
    });
  }

  private sendBalance = async () => {
    const balances = await parseBalances(await this.boltz.getBalance());

    let message = 'Balances:';

    balances.forEach((balance, symbol) => {
      // tslint:disable-next-line:prefer-template
      message += `\n\n**${symbol}**\n` +
        `Wallet: ${satoshisToCoins(balance.walletBalance!.totalBalance)} ${symbol}\n` +
        `Channels: ${satoshisToCoins(balance.channelBalance)} ${symbol}`;
    });

    await this.discord.sendMessage(message);
  }

  private sendFees = async () => {
    let message = 'Fees:\n';

    // Get all successful (reverse) swaps
    const [swaps, reverseSwaps] = await Promise.all([
      this.service.swapRepository.getSwaps({
        status: SwapUpdateEvent.InvoicePaid,
      }),
      this.service.reverseSwapRepository.getReverseSwaps({
        status: SwapUpdateEvent.InvoiceSettled,
      }),
    ]);

    const fees = this.getFeeFromSwaps(swaps, reverseSwaps);

    fees.forEach((fee, symbol) => {
      message += `\n**${symbol}**: ${satoshisToCoins(fee)} ${symbol}`;
    });

    await this.discord.sendMessage(message);
  }

  private getFeeFromSwaps = (swaps: SwapInstance[], reverseSwaps: ReverseSwapInstance[]): Map<string, number> => {
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
}

export default CommandHandler;
