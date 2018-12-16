import axios from 'axios';
import Errors from './Errors';

class CryptoCompare {
  private static readonly URL = 'https://min-api.cryptocompare.com';

  public getPriceMulti = (fromSymbols: string[], toSymbols: string[]) => {
    return this.makeRequest(`data/pricemulti?fsyms=${this.arrayToList(fromSymbols)}&tsyms=${this.arrayToList(toSymbols)}`);
  }

  private makeRequest = async (endpoint: string): Promise<any> => {
    try {
      const response = await axios.get(`${CryptoCompare.URL}/${endpoint}`);

      // CryptoCompare is always returning the status code 200 therefore the response data
      // has to be parsed to determine whether the request was successful
      if (response.data.Response === 'Error') {
        throw Errors.COULD_NOT_GET_RATE(response.data.Message);
      }

      return response.data;

    } catch (error) {
      // If "error.code" is defined it is an error from axios which means that is has to be parsed first
      if (!error.code) {
        throw Errors.COULD_NOT_GET_RATE(error.code);
      }

      throw error;
    }
  }

  /**
   * Turns an array of strings into a comma separated list
   */
  private arrayToList = (array: string[]) => {
    return array.join(',');
  }
}

export default CryptoCompare;
