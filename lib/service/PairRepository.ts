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
        base: pair.base,
        quote: pair.quote,
      },
    });
  }
}

export default PairRepository;
