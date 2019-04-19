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

export const reportCli = async (argv: Arguments<any>) => {
  // Get the path to the database from the command line arguments or
  // use a default one if none was specified
  const dbPath = argv.dbpath || '~/.boltz-middleware/boltz.db';

  const db = new Database(Logger.disabledLogger, resolveHome(dbPath));
  await db.init();

  const csv = await generateReport(new SwapRepository(), new ReverseSwapRepository());

  if (argv.reportpath) {
    fs.writeFileSync(resolveHome(argv.reportpath), csv);
  } else {
    console.log(csv);
  }
};

export const generateReport = async (swapRepository: SwapRepository, reverseSwapRepository: ReverseSwapRepository) => {
  const { swaps, reverseSwaps } = await getSuccessfulTrades(swapRepository, reverseSwapRepository);
  const entries = swapsToEntries(swaps, reverseSwaps);

  entries.sort((a, b) => {
    return a.date.getTime() - b.date.getTime();
  });

  return arrayToCsv(entries);
};

const swapsToEntries = (swaps: Swap[], reverseSwaps: ReverseSwap[]) => {
  const entries: Entry[] = [];

  const pushToEntries = (array: Swap[] | ReverseSwap[], isReverse: boolean) => {
    array.forEach((swap: Swap | ReverseSwap) => {
      entries.push({
        date: new Date(swap.createdAt),
        pair: swap.pair,
        type: getSwapType(swap.orderSide, isReverse),
        orderSide: swap.orderSide === 0 ? 'buy' : 'sell',

        fee: satoshisToCoins(swap.fee).toFixed(8),
        feeCurrency: getFeeSymbol(swap.pair, swap.orderSide, isReverse),
      });
    });
  };

  pushToEntries(swaps, false);
  pushToEntries(reverseSwaps, true);

  return entries;
};

/**
 * Gets all successful (reverse) swaps
 */
export const getSuccessfulTrades = async (swapRepository: SwapRepository, reverseSwapRepository: ReverseSwapRepository):
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
};

const getSwapType = (orderSide: number, isReverse: boolean) => {
  if ((orderSide === 0 && !isReverse) || (orderSide !== 0 && isReverse)) {
    return 'Lightning/Chain';
  } else {
    return 'Chain/Lightning';
  }
};

const arrayToCsv = (entries: Entry[]) => {
  const lines: string[] = [];

  if (entries.length !== 0) {
    const keys = Object.keys(entries[0]);
    lines.push(keys.join(','));
  }

  entries.forEach((entry) => {
    const date = entry.date.toLocaleString('en-US', { hour12: false }).replace(',', '');

    lines.push(`${date},${entry.pair},${entry.type},${entry.orderSide},${entry.fee},${entry.feeCurrency}`);
  });

  return lines.join('\n');
};
