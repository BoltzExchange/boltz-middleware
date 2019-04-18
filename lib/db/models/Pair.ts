import { Model, Sequelize, DataTypes } from 'sequelize';
import { getPairId } from '../../notifications/CommandHandler';

class Pair extends Model {
  public id!: string;
  public base!: string;
  public quote!: string;
  public rate!: number;

  public static load = (sequelize: Sequelize) => {
    Pair.init({
      id: { type: new DataTypes.STRING(255), primaryKey: true },
      base: { type: new DataTypes.STRING(255), allowNull: false },
      quote: { type: new DataTypes.STRING(255), allowNull: false },
      rate: { type: new DataTypes.FLOAT(), allowNull: true },
    }, {
      sequelize,
      tableName: 'pairs',
      timestamps: false,
    });

    Pair.beforeBulkCreate(pairs => pairs.forEach(pair => pair.id = getPairId(pair)));
    Pair.beforeCreate((pair) => { pair.id = getPairId(pair); });
  }
}

export default Pair;
