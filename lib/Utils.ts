import os from 'os';
import path from 'path';
import { PairFactory } from './consts/Database';

const idPossibilities = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate an id
 *
 * @param length how many characters the id should have
 */
export const generateId = (length: number) => {
  let id = '';

  for (let i = 0; i < length; i += 1) {
    id += idPossibilities.charAt(Math.floor(Math.random() * idPossibilities.length));
  }

  return id;
};

/**
 * Get the pair id of a pair
 */
export const getPairId = (pair: PairFactory): string => {
  return `${pair.base}/${pair.quote}`;
};

/**
 * Get the quote and base asset of a pair id
 */
export const splitPairId = (pairId: string): { quote: string, base: string } => {
  const split = pairId.split('/');

  return {
    base: split[0],
    quote: split[1],
  };
};

/**
 * Get the current date in the LocaleString format.
 */
export const getTsString = (): string => (new Date()).toLocaleString('en-US', { hour12: false });

/**
 * Concat an error code and its prefix
 */
export const concatErrorCode = (prefix: number, code: number) => {
  return `${prefix}.${code}`;
};

/**
 * Stringify any object or array
 */
export const stringify = (object: any) => {
  return JSON.stringify(object, undefined, 2);
};

/**
 * Turn a map into an object
 */
export const mapToObject = (map: Map<any, any>) => {
  const object: any = {};

  map.forEach((value, index) => {
    object[index] = value;
  });

  return object;
};

/**
 * Check whether a variable is a non-array object
 */
export const isObject = (val: any): boolean => {
  return (val && typeof val === 'object' && !Array.isArray(val));
};

/**
 * Recursively merge properties from different sources into a target object, overriding any
 * existing properties
 *
 * @param target The destination object to merge into.
 * @param sources The sources objects to copy from.
 */
export const deepMerge = (target: any, ...sources: any[]): object => {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        Object.assign(target, { [key]: source[key] });
      }
    });
  }

  return deepMerge(target, ...sources);
};

/**
 * Capitalize the first letter of a string
 */
export const capitalizeFirstLetter = (input: string) => {
  return input.charAt(0).toUpperCase() + input.slice(1);
};

/**
 * Gets the home directory
 */
export const getSystemHomeDir = (): string => {
  switch (os.platform()) {
    case 'win32': return process.env.LOCALAPPDATA!;
    case 'darwin': return path.join(process.env.HOME!, 'Library', 'Application Support');

    default: return process.env.HOME!;
  }
};

/**
 * Get the data directory of a service
 */
export const getServiceDir = (service: string) => {
  const homeDir = getSystemHomeDir();
  const serviceDir = service.toLowerCase();

  switch (os.platform()) {
    case 'win32':
    case 'darwin':
      return path.join(homeDir, capitalizeFirstLetter(serviceDir));

    default: return path.join(homeDir, `.${serviceDir}`);
  }
};

/**
 * Resolve '~' on Linux and Unix-Like systems
 */
export const resolveHome = (filename: string) => {
  if (os.platform() !== 'win32') {
    if (filename.charAt(0) === '~') {
      return path.join(process.env.HOME!, filename.slice(1));
    }
  }

  return filename;
};

/**
 * Convert minutes into milliseconds
 */
export const minutesToMilliseconds = (minutes: number) => {
  return minutes * 60 * 1000;
};

/**
 * Convert satoshis to whole coins and remove trailing zeros
 */
export const satoshisToWholeCoins = (satoshis: number) => {
  return roundToDecimals(satoshis / 100000000, 8);
};

/**
 * Round a number to a specific amount of decimals
 */
export const roundToDecimals = (number: number, decimals: number) => {
  return Number(number.toFixed(decimals));
};
