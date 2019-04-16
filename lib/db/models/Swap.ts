import { Sequelize, Model, DataTypes } from 'sequelize';
import Pair from './Pair';

class Swap extends Model {
  public id!: string;
  public fee!: number;
  public pair!: string;
  public orderSide!: number;
  public status!: string;
  public invoice!: string;
  public lockupAddress!: string;

  public static load = (sequelize: Sequelize) => {
    Swap.init({
      id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      fee: { type: DataTypes.INTEGER, allowNull: false },
      pair: { type: DataTypes.STRING, allowNull: false },
      orderSide: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: true },
      invoice: { type: DataTypes.STRING, unique: true, allowNull: false },
      lockupAddress: { type: DataTypes.STRING, allowNull: false },
    }, {
      sequelize,
      tableName: 'swaps',
      indexes: [
        {
          unique: true,
          fields: ['id', 'invoice'],
        },
      ],
    });

    Swap.belongsTo(Pair, {
      foreignKey: 'pair',
    });
  }
}

export default Swap;
