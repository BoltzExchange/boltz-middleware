import { Model, Sequelize, DataTypes } from 'sequelize';
import { getPairId } from '../../Utils';

class Pair extends Model {
  public id!: string;
  public base!: string;
  public quote!: string;
  public rate!: number;

  public static load = (sequelize: Sequelize) => {
    Pair.init({
      id: { type: DataTypes.STRING, primaryKey: true },
      base: { type: DataTypes.STRING, allowNull: false },
      quote: { type: DataTypes.STRING, allowNull: false },
      rate: { type: DataTypes.FLOAT, allowNull: true },
    }, {
      sequelize,
      tableName: 'pairs',
      timestamps: false,
    });

    Pair.beforeBulkCreate(pairs => pairs.forEach(pair => pair.id = getPairId(pair)));
    Pair.beforeCreate(pair => pair.id = getPairId(pair));
  }
}

export default Pair;
