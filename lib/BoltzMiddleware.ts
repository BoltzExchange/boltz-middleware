import { Arguments } from 'yargs';
import Config from './Config';
import Logger from './Logger';
import BoltzClient from './boltz/BoltzClient';
import { stringify } from './Utils';

class BoltzMiddleware {
  private config: Config;
  private logger: Logger;

  private boltzClient: BoltzClient;

  constructor(argv: Arguments) {
    this.config = new Config();
    this.config.load(argv);

    this.logger = new Logger(this.config.logpath, this.config.loglevel);

    this.boltzClient = new BoltzClient(this.logger, this.config.boltz);
  }

  public start = async () => {
    await this.connectBoltz();
  }

  private connectBoltz = async () => {
    await this.boltzClient.connect();

    if (this.boltzClient.isConnected()) {
      this.logger.info('Connected to Boltz');
      this.logger.verbose(`Boltz status: ${stringify(await this.boltzClient.getInfo())}`);
    }
  }
}

export default BoltzMiddleware;
