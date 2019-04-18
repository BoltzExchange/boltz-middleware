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
  public createdAt!: string;
  public updatedAt!: string;

  public static load = (sequelize: Sequelize) => {
    Swap.init({
      id: { type: new DataTypes.STRING(255), primaryKey: true, allowNull: false },
      fee: { type: new DataTypes.INTEGER(), allowNull: false },
      pair: { type: new DataTypes.STRING(255), allowNull: false },
      orderSide: { type: new DataTypes.INTEGER(), allowNull: false },
      status: { type: new DataTypes.STRING(255), allowNull: true },
      invoice: { type: new DataTypes.STRING(255), unique: true, allowNull: false },
      lockupAddress: { type: new DataTypes.STRING(255), allowNull: false },
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
