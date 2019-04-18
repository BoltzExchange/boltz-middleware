import { Model, Sequelize, DataTypes } from 'sequelize';

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

    Pair.beforeBulkCreate(pairs => pairs.forEach(pair => pair.id = `${pair.base}/${pair.quote}`));
    Pair.beforeCreate((pair) => { pair.id = `${pair.base}/${pair.quote}`; });
  }
}

export default Pair;
