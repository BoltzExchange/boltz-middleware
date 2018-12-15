import { Models } from '../db/Database';
import * as db from '../consts/Database';

class PairRepository {
  constructor(private models: Models) {}

  public getPairs = async () => {
    return this.models.Pair.findAll({});
  }

  public addPair = async (pair: db.PairFactory) => {
    return this.models.Pair.create(<db.PairAttributes>pair);
  }

  public removePair = async (pair: db.PairFactory) => {
    return this.models.Pair.destroy({
      where: {
        base: pair.base,
        quote: pair.quote,
      },
    });
  }
}

export default PairRepository;
