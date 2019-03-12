import fs from 'fs';
import path from 'path';
import Sequelize from 'sequelize';
import Logger from '../Logger';
import * as db from '../consts/Database';

type Models = {
  Pair: Sequelize.Model<db.PairInstance, db.PairAttributes>;
  Swap: Sequelize.Model<db.SwapInstance, db.SwapAttributes>;
  ReverseSwap: Sequelize.Model<db.ReverseSwapInstance, db.ReverseSwapAttributes>;
};

class Database {
  public sequelize: Sequelize.Sequelize;
  public models: Models;

  /**
   * @param storage the file path to the SQLite databse; if ':memory:' the databse will be stored in the memory
   */
  constructor(private logger: Logger, private storage: string) {
    this.sequelize = new Sequelize({
      storage,
      logging: this.logger.silly,
      dialect: 'sqlite',
      operatorsAliases: false,
    });

    this.models = this.loadModels();
  }

  public init = async () => {
    try {
      await this.sequelize.authenticate();
      this.logger.info(`Connected to database: ${this.storage === ':memory:' ? 'in memory' : this.storage}`);
    } catch (error) {
      this.logger.error(`Could not connect to database: ${error}`);
      throw error;
    }

    await this.models.Pair.sync(),

    await Promise.all([
      this.models.Swap.sync(),
      this.models.ReverseSwap.sync(),
    ]);
  }

  public close = async () => {
    await this.sequelize.close();
  }

  private loadModels = (): Models => {
    const models: { [index: string]: Sequelize.Model<any, any> } = {};
    const modelsFolder = path.join(__dirname, 'models');

    fs.readdirSync(modelsFolder)
      .filter(file => (file.indexOf('.') !== 0) && (file !== path.basename(__filename)) &&
       (file.endsWith('.js') || file.endsWith('.ts')) && !file.endsWith('.d.ts'))
      .forEach((file) => {
        const model = this.sequelize.import(path.join(modelsFolder, file));
        models[model.name] = model;
      });

    Object.keys(models).forEach((key) => {
      const model = models[key];
      if (model.associate) {
        model.associate(models);
      }
    });

    return <Models>models;
  }
}

export default Database;
export { Models };
