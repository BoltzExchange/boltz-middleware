import cors from 'cors';
import express, { Application } from 'express';
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
  private controller: Controller;

  constructor(private logger: Logger, private config: ApiConfig, service: Service) {
    this.app = express();

    this.app.use(cors());
    this.app.use(express.json());

    this.controller = new Controller(logger, service);
    this.registerRoutes(this.controller);
  }

  public init = async () => {
    await this.controller.init();

    this.app.listen(this.config.port, this.config.host, () => {
      this.logger.info(`API server listening on: ${this.config.host}:${this.config.port}`);
    });
  }

  private registerRoutes = (controller: Controller) => {
    // GET requests
    this.app.route('/getpairs').get(controller.getPairs);
    this.app.route('/getlimits').get(controller.getLimits);
    this.app.route('/getfeeestimation').get(controller.getFeeEstimation);

    // POST requests
    this.app.route('/swapstatus').post(controller.swapStatus);

    this.app.route('/gettransaction').post(controller.getTransaction);
    this.app.route('/broadcasttransaction').post(controller.broadcastTransaction);

    this.app.route('/createswap').post(controller.createSwap);
    this.app.route('/createreverseswap').post(controller.createReverseSwap);

    // EventSource streams
    this.app.route('/streamswapstatus').get(controller.streamSwapStatus);
  }
}

export default Api;
export { ApiConfig };
