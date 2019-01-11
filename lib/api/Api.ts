import express, { Application } from 'express';
import cors from 'cors';
import Logger from '../Logger';
import Controller from './Controller';
import Service from '../service/Service';

type ApiConfig = {
  host: string;
  port: number;

  interval: number;
};

class Api {
  private app: Application;

  constructor(private logger: Logger, private config: ApiConfig, service: Service) {
    this.app = express();

    this.app.use(cors());
    this.app.use(express.json());

    const controller = new Controller(logger, service);
    this.registerRoutes(controller);
  }

  public init = () => {
    this.app.listen(this.config.port, this.config.host, () => {
      this.logger.info(`API server listening on: ${this.config.host}:${this.config.port}`);
    });
  }

  private registerRoutes = (controller: Controller) => {
    this.app.route('/getpairs').get(controller.getPairs);

    this.app.route('/gettransaction').post(controller.getTransaction);
    this.app.route('/broadcasttransaction').post(controller.broadcastTransaction);

    this.app.route('/createswap').post(controller.createSwap);
    this.app.route('/createreverseswap').post(controller.createReverseSwap);

    this.app.route('/swapstatus').get(controller.swapStatus);
  }
}

export default Api;
export { ApiConfig };
