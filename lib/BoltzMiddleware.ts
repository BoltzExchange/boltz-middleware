import { Arguments } from 'yargs';
import Api from './api/Api';
import Config from './Config';
import Logger from './Logger';
import Database from './db/Database';
import Service from './service/Service';
import BoltzClient from './boltz/BoltzClient';
import NotificationProvider from './notifications/NotificationProvider';

class BoltzMiddleware {
  private config: Config;
  private logger: Logger;

  private db: Database;
  private boltzClient: BoltzClient;

  private service: Service;
  private notifications: NotificationProvider;

  private api: Api;

  constructor(argv: Arguments<any>) {
    this.config = new Config();
    this.config.init(argv);

    this.logger = new Logger(this.config.logpath, this.config.loglevel);

    this.db = new Database(this.logger, this.config.dbpath);
    this.boltzClient = new BoltzClient(this.logger, this.config.boltz);

    this.service = new Service(this.logger, this.db, this.boltzClient, this.config.api.interval);

    this.notifications = new NotificationProvider(
      this.logger,
      this.boltzClient,
      this.config.notification,
      this.config.currencies,
    );

    this.api = new Api(this.logger, this.config.api, this.service);
  }

  public start = async () => {
    await Promise.all([
      this.db.init(),
      this.connectBoltz(),
    ]);

    await this.service.init(this.config.pairs);
    await this.notifications.init();

    this.api.init();
  }

  private connectBoltz = async () => {
    await this.boltzClient.connect();
  }
}

export default BoltzMiddleware;
