import { Arguments } from 'yargs';
import Config from './Config';
import Logger from './Logger';
import BoltzClient from './boltz/BoltzClient';
import Api from './api/Api';
import Service from './service/Service';

class BoltzMiddleware {
  private config: Config;
  private logger: Logger;

  private boltzClient: BoltzClient;

  private api: Api;

  constructor(argv: Arguments) {
    this.config = new Config();
    this.config.load(argv);

    this.logger = new Logger(this.config.logpath, this.config.loglevel);

    this.boltzClient = new BoltzClient(this.logger, this.config.boltz);

    const service = new Service(this.boltzClient);
    this.api = new Api(this.logger, this.config.api, service);
  }

  public start = async () => {
    await this.connectBoltz();

    this.api.init();
  }

  private connectBoltz = async () => {
    await this.boltzClient.connect();
  }
}

export default BoltzMiddleware;
