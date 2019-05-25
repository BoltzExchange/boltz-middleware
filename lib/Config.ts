import fs from 'fs';
import path from 'path';
import toml from 'toml';
import { Arguments } from 'yargs';
import { ApiConfig } from './api/Api';
import { PairConfig } from './service/Service';
import { CurrencyConfig } from './consts/Types';
import { BoltzConfig } from './boltz/BoltzClient';
import { BackupConfig } from './backup/BackupScheduler';
import { getServiceDir, deepMerge, resolveHome } from './Utils';
import { NotificationConfig } from './notifications/NotificationProvider';

class Config {
  public logpath: string;
  public loglevel: string;

  public dbpath: string;

  public api: ApiConfig;

  public boltz: BoltzConfig;

  public notification: NotificationConfig;
  public backup: BackupConfig;

  public currencies: CurrencyConfig[];

  public pairs: PairConfig[];

  private defaultDataDir = getServiceDir('boltz-middleware');
  private dataDir = this.defaultDataDir;

  private configpath: string;

  constructor() {
    const { configpath, logpath, dbpath, backup } = this.getDataDirPaths(this.defaultDataDir);

    this.configpath = configpath;

    this.logpath = logpath;
    this.loglevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    this.dbpath = dbpath;

    this.api = {
      host: '127.0.0.1',
      port: 9001,

      interval: 1,
    };

    this.boltz = {
      host: '127.0.0.1',
      port: 9000,
      certpath: path.join(getServiceDir('boltz'), 'tls.cert'),
    };

    this.notification = {
      token: '',
      channel: '',

      prefix: '',
      interval: 1,
    };

    this.backup = {
      email: '',
      privatekeypath: backup.privatekeypath,

      bucketname: '',

      interval: '0 0 * * *',

      backenddbpath: '',
    };

    this.currencies = [
      {
        symbol: 'BTC',

        maxSwapAmount: 100000,
        minSwapAmount: 1000,

        minWalletBalance: 1000000,

        minLocalBalance: 500000,
        minRemoteBalance: 500000,
      },
      {
        symbol: 'LTC',

        maxSwapAmount: 10000000,
        minSwapAmount: 10000,

        minWalletBalance: 100000000,

        minLocalBalance: 50000000,
        minRemoteBalance: 50000000,
      },
    ];

    this.pairs = [
      {
        base: 'LTC',
        quote: 'BTC',

        fee: 1,
      },
      {
        base: 'BTC',
        quote: 'BTC',

        fee: 0.5,
        rate: 1,
      },
      {
        base: 'LTC',
        quote: 'LTC',

        rate: 1,
        fee: 0.5,
      },
    ];
  }

  public init = (argv: Arguments<any>) => {
    this.parseParameters(argv);
  }

  /**
   * Parse either command line arguments or options in a config file
   */
  private parseParameters = (parameters: any) => {
    // A list of all paths in which '~' should be resolved
    const pathsToResolve = [
      'logpath',
      'dbpath',
      'boltz.certpath',
      'backup.privatekeypath',
    ];

    pathsToResolve.forEach((key) => {
      if (parameters[key]) {
        parameters[key] = resolveHome(parameters[key]);
      }
    });

    if (parameters.datadir) {
      this.dataDir = parameters.datadir;

      deepMerge(this, this.getDataDirPaths(parameters.datadir));
    }

    if (fs.existsSync(this.configpath)) {
      const config = fs.readFileSync(this.configpath, 'utf-8');

      try {
        const parsedConfig = toml.parse(config);

        if (!parameters.datadir && parsedConfig.datadir) {
          deepMerge(this, this.getDataDirPaths(parsedConfig.datadir));
        }

        deepMerge(this, parsedConfig);
      } catch (error) {
        throw `Error parsing config file in line ${error.line}:${error.column}: ${error.message}`;
      }
    }

    deepMerge(this, parameters);

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir);
    }
  }

  private getDataDirPaths = (dataDir: string) => {
    return {
      configpath: path.join(dataDir, 'boltz.conf'),
      logpath: path.join(dataDir, 'boltz.log'),
      dbpath: path.join(dataDir, 'boltz.db'),
      backup: {
        privatekeypath: path.join(dataDir, 'backupPrivatekey.pem'),
      },
    };
  }
}

export default Config;
export { PairConfig };
