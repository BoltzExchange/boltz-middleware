import fs from 'fs';
import { Arguments } from 'yargs';
import Logger from '../Logger';
import Database from '../db/Database';
import SwapRepository from '../service/SwapRepository';
import ReverseSwapRepository from '../service/ReverseSwapRepository';
import { SwapInstance, ReverseSwapInstance } from 'lib/consts/Database';
import { getSuccessfulTrades, getFeeSymbol, resolveHome } from '../Utils';

type Entry = {
  date: Date;
  pair: string;
  orderSide: string,

  fee: number;
  feeCurrency: string;
};

export const generateReport = async (argv: Arguments<any>) => {
  const db = new Database(Logger.disabledLogger, resolveHome(argv.dbpath));
  await db.init();

  const swapRepository = new SwapRepository(db.models);
  const reverseSwapRepository = new ReverseSwapRepository(db.models);

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

const swapsToEntries = (swaps: SwapInstance[], reverseSwaps: ReverseSwapInstance[]) => {
  const entries: Entry[] = [];

  const pushToEntries = (array: SwapInstance[] | ReverseSwapInstance[], isReverse: boolean) => {
    array.forEach((swap: SwapInstance | ReverseSwapInstance) => {
      entries.push({
        date: new Date(swap.createdAt),
        pair: swap.pair,
        orderSide: swap.orderSide === 0 ? 'buy' : 'sell',

        fee: swap.fee,
        feeCurrency: getFeeSymbol(swap.pair, swap.orderSide, isReverse),
      });
    });
  };

  pushToEntries(swaps, false);
  pushToEntries(reverseSwaps, true);

  return entries;
};

const arrayToCsv = (entries: Entry[]) => {
  const lines: string[] = [];

  if (entries.length !== 0) {
    const keys = Object.keys(entries[0]);
    lines.push(keys.join(','));
  }

  entries.forEach((entry) => {
    const date = entry.date.toLocaleString('en-US', { hour12: false }).replace(',', '');

    lines.push(`${date},${entry.pair},${entry.orderSide},${entry.fee},${entry.feeCurrency}`);
  });

  return lines.join('\n');
};
