import { Model, Sequelize, DataTypes } from 'sequelize';
import Pair from './Pair';

class ReverseSwap extends Model {
  public id!: string;
  public fee!: number;
  public pair!: string;
  public orderSide!: number;
  public status!: string;
  public invoice!: string;
  public preimage!: string;
  public transactionId!: string;
  public createdAt!: string;
  public updatedAt!: string;

  public static load = (sequelize: Sequelize) => {
    ReverseSwap.init({
      id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      fee: { type: DataTypes.INTEGER, allowNull: false },
      pair: { type: DataTypes.STRING, allowNull: false },
      orderSide: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: true },
      invoice: { type: DataTypes.STRING, allowNull: false },
      preimage: { type: DataTypes.STRING, allowNull: true },
      transactionId: { type: DataTypes.STRING, allowNull: false },
      createdAt: { type: DataTypes.STRING, allowNull: false },
      updatedAt: { type: DataTypes.STRING, allowNull: true },
    }, {
      sequelize,
      tableName: 'reverseSwaps',
    });

    ReverseSwap.belongsTo(Pair, {
      foreignKey: 'pair',
    });
  }
}

export default ReverseSwap;
