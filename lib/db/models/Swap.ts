import Sequelize from 'sequelize';
import * as db from '../../consts/Database';

export default (sequelize: Sequelize.Sequelize, dataTypes: Sequelize.DataTypes) => {
  const attributes: db.SequelizeAttributes<db.SwapAttributes> = {
    id: { type: dataTypes.STRING, primaryKey: true, allowNull: false },
    pair: { type: dataTypes.STRING, allowNull: false },
    status: { type: dataTypes.STRING, allowNull: true },
    invoice: { type: dataTypes.STRING, unique: true, allowNull: false },
    lockupAddress: { type: dataTypes.STRING, allowNull: false },
  };

  const options: Sequelize.DefineOptions<db.SwapInstance> = {
    tableName: 'swaps',
    indexes: [
      {
        unique: true,
        fields: ['id', 'invoice'],
      },
    ],
  };

  const Swap = sequelize.define<db.SwapInstance, db.SwapAttributes>('Swap', attributes, options);

  Swap.associate = (models: Sequelize.Models) => {
    models.Swap.belongsTo(models.Pair, {
      foreignKey: 'pair',
    });
  };

  return Swap;
};
