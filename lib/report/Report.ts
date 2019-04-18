import fs from 'fs';
import { Arguments } from 'yargs';
import Logger from '../Logger';
import Database from '../db/Database';
import SwapRepository from '../service/SwapRepository';
import ReverseSwapRepository from '../service/ReverseSwapRepository';
import Swap from '../db/models/Swap';
import ReverseSwap from '../db/models/ReverseSwap';
import { getFeeSymbol, resolveHome, satoshisToCoins } from '../Utils';
import { getSuccessfulTrades } from '../notifications/CommandHandler';

type Entry = {
  date: Date;
  pair: string;
  type: string;
  orderSide: string,

  fee: string;
  feeCurrency: string;
};

export const generateReport = async (argv: Arguments<any>) => {
  // Get the path to the database from the command line arguments or
  // use the default one if none was specified
  const dbPath = argv.dbpath || '~/.boltz-middleware/boltz.db';

  const db = new Database(Logger.disabledLogger, resolveHome(dbPath));
  await db.init();

  const swapRepository = new SwapRepository();
  const reverseSwapRepository = new ReverseSwapRepository();

  const { swaps, reverseSwaps } = await getSuccessfulTrades(swapRepository, reverseSwapRepository);
  const entries = swapsToEntries(swaps, reverseSwaps);

  entries.sort((a, b) => {
    return a.date.getTime() - b.date.getTime();
  });

  const csv = arrayToCsv(entries);

  if (argv.reportpath) {
    fs.writeFileSync(resolveHome(argv.reportpath), csv);
  } else {
    console.log(csv);
  }
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
