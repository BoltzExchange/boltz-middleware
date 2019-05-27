import { Op } from 'sequelize';
import Pair from '../db/models/Pair';

class PairRepository {

  public getPairs = async () => {
    return Pair.findAll({});
  }

  public addPair = async (pair: {
    base: string,
    quote: string,
    rate?: number,
  }) => {
    return Pair.create(pair);
  }

  public removePair = async (pair: {
    base: string,
    quote: string,
    rate?: number,
  }) => {
    return Pair.destroy({
      where: {
        base: {
          [Op.eq]: pair.base,
        },
        quote: {
          [Op.eq]: pair.quote,
        },
      },
    });
  }

  public dropTable = async () => {
    return Pair.drop();
  }
}

export default PairRepository;
