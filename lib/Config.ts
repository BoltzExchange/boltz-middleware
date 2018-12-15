import { Arguments } from 'yargs';
import fs from 'fs';
import path from 'path';
import toml from 'toml';
import { ApiConfig } from './api/Api';
import { BoltzConfig } from './boltz/BoltzClient';
import { getServiceDir, deepMerge, resolveHome } from './Utils';

type PairConfig = {
  base: string;
  quote: string;
};

class Config {
  public logpath: string;
  public loglevel: string;

  public dbpath: string;

  public api: ApiConfig;

  public boltz: BoltzConfig;

  public pairs: PairConfig[];

  private defaultDataDir = getServiceDir('boltz-middleware');
  private dataDir = this.defaultDataDir;

  private configpath: string;

  constructor() {
    const { configpath, logpath, dbpath } = this.getDataDirPaths(this.defaultDataDir);

    this.configpath = configpath;

    this.logpath = logpath;
    this.loglevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    this.dbpath = dbpath;

    this.api = {
      host: '127.0.0.1',
      port: 9001,
    };

    this.boltz = {
      host: '127.0.0.1',
      port: 9000,
      certpath: path.join(getServiceDir('boltz'), 'tls.cert'),
    };

    this.pairs = [
      {
        base: 'LTC',
        quote: 'BTC',
      },
    ];
  }

  public init = (argv: Arguments) => {
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
    };
  }
}

export default Config;
export { PairConfig };
