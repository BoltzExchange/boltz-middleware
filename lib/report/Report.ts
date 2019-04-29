import fs from 'fs';
import { Op } from 'sequelize';
import { Arguments } from 'yargs';
import Logger from '../Logger';
import Swap from '../db/models/Swap';
import Database from '../db/Database';
import { SwapUpdateEvent } from '../consts/Enums';
import ReverseSwap from '../db/models/ReverseSwap';
import SwapRepository from '../service/SwapRepository';
import ReverseSwapRepository from '../service/ReverseSwapRepository';
import { getFeeSymbol, resolveHome, satoshisToCoins } from '../Utils';

type Entry = {
  date: Date;
  pair: string;
  type: string;
  orderSide: string,

  fee: string;
  feeCurrency: string;
};

class Report {
  constructor(private swapRepository: SwapRepository, private reverseSwapRepository: ReverseSwapRepository) {}

  public static cli = async (argv: Arguments<any>) => {
    // Get the path to the database from the command line arguments or
    // use a default one if none was specified
    const dbPath = argv.dbpath || '~/.boltz-middleware/boltz.db';

    const db = new Database(Logger.disabledLogger, resolveHome(dbPath));
    await db.init();

    const report = new Report(new SwapRepository(), new ReverseSwapRepository());
    const csv = await report.generate();

    if (argv.reportpath) {
      fs.writeFileSync(resolveHome(argv.reportpath), csv);
    } else {
      console.log(csv);
    }
  }

  /**
   * Gets all successful (reverse) swaps
   */
  public static getSuccessfulTrades = async (swapRepository: SwapRepository, reverseSwapRepository: ReverseSwapRepository):
    Promise<{ swaps: Swap[], reverseSwaps: ReverseSwap[] }> => {

    const [swaps, reverseSwaps] = await Promise.all([
      swapRepository.getSwaps({
        status: {
          [Op.eq]: SwapUpdateEvent.InvoicePaid,
        },
      }),
      reverseSwapRepository.getReverseSwaps({
        status: {
          [Op.eq]: SwapUpdateEvent.InvoiceSettled,
        },
      }),
    ]);

    return {
      swaps,
      reverseSwaps,
    };
  }

  public generate = async () => {
    const { swaps, reverseSwaps } = await Report.getSuccessfulTrades(this.swapRepository, this.reverseSwapRepository);
    const entries = this.swapsToEntries(swaps, reverseSwaps);

    entries.sort((a, b) => {
      return a.date.getTime() - b.date.getTime();
    });

    return this.arrayToCsv(entries);
  }

  private swapsToEntries = (swaps: Swap[], reverseSwaps: ReverseSwap[]) => {
    const entries: Entry[] = [];

    const pushToEntries = (array: Swap[] | ReverseSwap[], isReverse: boolean) => {
      array.forEach((swap: Swap | ReverseSwap) => {
        entries.push({
          date: new Date(swap.createdAt),
          pair: swap.pair,
          type: this.getSwapType(swap.orderSide, isReverse),
          orderSide: swap.orderSide === 0 ? 'buy' : 'sell',

          fee: satoshisToCoins(swap.fee).toFixed(8),
          feeCurrency: getFeeSymbol(swap.pair, swap.orderSide, isReverse),
        });
      });
    };

    pushToEntries(swaps, false);
    pushToEntries(reverseSwaps, true);

    return entries;
  }

  private arrayToCsv = (entries: Entry[]) => {
    const lines: string[] = [];

    if (entries.length !== 0) {
      const keys = Object.keys(entries[0]);
      lines.push(keys.join(','));
    }

    entries.forEach((entry) => {
      const date = this.formatDate(entry.date);

      lines.push(`${date},${entry.pair},${entry.type},${entry.orderSide},${entry.fee},${entry.feeCurrency}`);
    });

    return lines.join('\n');
  }

  private formatDate = (date: Date) => {
    return date.toLocaleString('en-US', { hour12: false }).replace(',', '');
  }

  private getSwapType = (orderSide: number, isReverse: boolean) => {
    if ((orderSide === 0 && !isReverse) || (orderSide !== 0 && isReverse)) {
      return 'Lightning/Chain';
    } else {
      return 'Chain/Lightning';
    }
  }
}

export default Report;
