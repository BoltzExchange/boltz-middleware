import Sequelize from 'sequelize';
import * as db from '../../consts/Database';

export default (sequelize: Sequelize.Sequelize, dataTypes: Sequelize.DataTypes) => {
  const attributes: db.SequelizeAttributes<db.ReverseSwapAttributes> = {
    id: { type: dataTypes.STRING, primaryKey: true, allowNull: false },
    fee: { type: dataTypes.INTEGER, allowNull: false },
    pair: { type: dataTypes.STRING, allowNull: false },
    orderSide: { type: dataTypes.INTEGER, allowNull: false },
    status: { type: dataTypes.STRING, allowNull: true },
    invoice: { type: dataTypes.STRING, allowNull: false },
    preimage: { type: dataTypes.STRING, allowNull: true },
    transactionId: { type: dataTypes.STRING, allowNull: false },
  };

  const options: Sequelize.DefineOptions<db.ReverseSwapInstance> = {
    tableName: 'reverseSwaps',
  };

  const ReverseSwap = sequelize.define<db.ReverseSwapInstance, db.ReverseSwapAttributes>('ReverseSwap', attributes, options);

  ReverseSwap.associate = (models: Sequelize.Models) => {
    models.ReverseSwap.belongsTo(models.Pair, {
      foreignKey: 'pair',
    });
  };

  return ReverseSwap;
};
