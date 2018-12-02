import { Request, Response } from 'express';
import Service from '../service/Service';

class Controller {
  constructor(private service: Service) {}

  public getTransaction = async (req: Request, res: Response) => {
    try {
      const { currency, transactionHash } = this.validateBody(req.body, [
        { name: 'currency', type: 'string' },
        { name: 'transactionHash', type: 'string' },
      ]);

      const response = await this.service.getTransaction(currency, transactionHash);
      this.successResponse(res, response);

    } catch (error) {
      this.writeErrorResponse(res, error);
    }
  }

  public broadcastTransaction = async (req: Request, res: Response) => {
    try {
      const { currency, transactionHex } = this.validateBody(req.body, [
        { name: 'currency', type: 'string' },
        { name: 'transactionHex', type: 'string' },
      ]);

      const response = await this.service.broadcastTransaction(currency, transactionHex);
      this.successResponse(res, response);

    } catch (error) {
      this.writeErrorResponse(res, error);
    }
  }

  public createSwap = async (req: Request, res: Response) => {
    try {
      const { pairId, orderSide, invoice, refundPublicKey } = this.validateBody(req.body, [
        { name: 'pairId', type: 'string' },
        { name: 'orderSide', type: 'number' },
        { name: 'invoice', type: 'string' },
        { name: 'refundPublicKey', type: 'string' },
      ]);

      const response = await this.service.createSwap(pairId, orderSide, invoice, refundPublicKey);
      this.swapCreatedResponse(res, response);

    } catch (error) {
      this.writeErrorResponse(res, error);
    }
  }

  /**
   * Makes sure that all required arguments were provided in the body correctly
   *
   * @returns the validated arguments
   */
  private validateBody = (body: object, argsToCheck: { name: string, type: string }[]) => {
    const response: any = {};

    argsToCheck.forEach((arg) => {
      const value = body[arg.name];

      if (value !== undefined) {
        if (typeof value === arg.type) {
          response[arg.name] = value;
        } else {
          throw `invalid parameter: ${arg.name}`;
        }
      } else {
        throw `undefined parameter: ${arg.name}`;
      }
    });

    return response;
  }

  private writeErrorResponse = (res: Response, error: any) => {
    if (typeof error === 'string') {
      this.invalidArgumentsResponse(res, error);
    } else {
      this.invalidArgumentsResponse(res, error.message);
    }
  }

  private successResponse = (res: Response, data: object) => {
    this.setContentTypeJson(res);
    res.status(200).json(data);
  }

  private swapCreatedResponse = (res: Response, data: object) => {
    this.setContentTypeJson(res);
    res.status(201).json(data);
  }

  private invalidArgumentsResponse = (res: Response, error: string) => {
    this.setContentTypeJson(res);
    res.status(400).json({ error });
  }

  private setContentTypeJson = (res: Response) => {
    res.set('Content-Type', 'application/json');
  }
}

export default Controller;
