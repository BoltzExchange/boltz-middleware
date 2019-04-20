import { Arguments } from 'yargs';
import Api from './api/Api';
import Config from './Config';
import Logger from './Logger';
import Report from './report/Report';
import Database from './db/Database';
import Service from './service/Service';
import BoltzClient from './boltz/BoltzClient';
import BackupScheduler from './backup/BackupScheduler';
import NotificationProvider from './notifications/NotificationProvider';

class BoltzMiddleware {
  private config: Config;
  private logger: Logger;

  private db: Database;
  private boltzClient: BoltzClient;

  private service: Service;
  private backup: BackupScheduler;
  private notifications: NotificationProvider;

  private api: Api;

  constructor(argv: Arguments<any>) {
    this.config = new Config();
    this.config.init(argv);

    this.logger = new Logger(this.config.logpath, this.config.loglevel);

    this.db = new Database(this.logger, this.config.dbpath);
    this.boltzClient = new BoltzClient(this.logger, this.config.boltz);

    this.service = new Service(
      this.logger,
      this.boltzClient,
      this.config.api.interval,
      this.config.currencies,
    );

    this.backup = new BackupScheduler(
      this.logger,
      this.config.dbpath,
      this.config.backup,
      new Report(
        this.service.swapRepository,
        this.service.reverseSwapRepository,
      ),
    );

    this.notifications = new NotificationProvider(
      this.logger,
      this.service,
      this.boltzClient,
      this.backup,
      this.config.notification,
      this.config.currencies,
    );

    this.api = new Api(this.logger, this.config.api, this.service);
  }

  public start = async () => {
    await Promise.all([
      this.db.init(),
      this.boltzClient.connect(),
    ]);

    await Promise.all([
      this.service.init(this.config.pairs),
      this.notifications.init(),
    ]);

    await this.api.init();
  }
}

export default BoltzMiddleware;
