import express, { Application } from 'express';
import cors from 'cors';
import Logger from '../Logger';
import Controller from './Controller';
import Service from '../service/Service';

// TODO: SSL certificate
type ApiConfig = {
  host: string;
  port: number;
};

class Api {
  private app: Application;

  constructor(private logger: Logger, private config: ApiConfig, service: Service) {
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors());

    const controller = new Controller(service);
    this.registerRoutes(controller);
  }

  public init = () => {
    this.app.listen(this.config.port, this.config.host, () => {
      this.logger.info(`API server listening on: ${this.config.host}:${this.config.port}`);
    });
  }

  private registerRoutes = (controller: Controller) => {
    this.app.route('/createswap').post(controller.createSwap);
  }
}

export default Api;
export { ApiConfig };
