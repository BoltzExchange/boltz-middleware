import Sequelize from 'sequelize';
import { getPairId } from '../../Utils';
import * as db from '../../consts/Database';

export default (sequelize: Sequelize.Sequelize, dataTypes: Sequelize.DataTypes) => {
  const attributes: db.SequelizeAttributes<db.PairAttributes> = {
    id: { type: dataTypes.STRING, primaryKey: true },
    base: { type: dataTypes.STRING, allowNull: false },
    quote: { type: dataTypes.STRING, allowNull: false },
    rate: { type: dataTypes.FLOAT, allowNull: true },
  };

  const options: Sequelize.DefineOptions<db.PairInstance> = {
    tableName: 'pairs',
    timestamps: false,
  };

  const Pair = sequelize.define<db.PairInstance, db.PairAttributes>('Pair', attributes, options);

  Pair.associate = (models: Sequelize.Models) => {
    models.Pair.beforeBulkCreate(pairs => pairs.forEach(pair => pair.id = getPairId(pair)));
    models.Pair.beforeCreate(pair => pair.id = getPairId(pair));
  };

  return Pair;
};
