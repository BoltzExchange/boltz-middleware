import { Arguments } from 'yargs';
import fs from 'fs';
import path from 'path';
import { BoltzConfig } from './boltz/BoltzClient';
import { getServiceDir, deepMerge, resolveHome } from './Utils';

// TODO: config file
class Config {
  public logpath: string;
  public loglevel: string;

  public boltz: BoltzConfig;

  private defaultDataDir = getServiceDir('boltz-middleware');
  private dataDir = this.defaultDataDir;

  constructor() {
    const { logpath } = this.getDataDirPaths(this.defaultDataDir);

    this.logpath = logpath;
    this.loglevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    this.boltz = {
      host: '127.0.0.1',
      port: 9000,
      certpath: path.join(getServiceDir('boltz'), 'tls.cert'),
    };
  }

  public load = (argv: Arguments) => {
    this.parseParameters(argv);
  }

  /**
   * Parse either command line arguments or options in a config file
   */
  private parseParameters = (parameters: any) => {
    // A list of all paths in which '~' should be resolved
    const pathsToResolve = [
      'logpath',
      'boltz.certpath',
    ];

    pathsToResolve.forEach((key) => {
      if (parameters[key]) {
        parameters[key] = resolveHome(parameters[key]);
      }
    });

    // The data dir is not the default one therefore the paths
    // dervied from it need to be updated
    if (parameters.datadir && parameters.datadir !== this.defaultDataDir) {
      this.dataDir = parameters.datadir;

      deepMerge(this, this.getDataDirPaths(parameters.datadir));
    }

    deepMerge(this, parameters);

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir);
    }
  }

  private getDataDirPaths = (dataDir: string) => {
    return {
      logpath: path.join(dataDir, 'boltz.log'),
    };
  }
}

export default Config;
