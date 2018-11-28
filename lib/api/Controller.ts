import { Request, Response } from 'express';
import Service from '../service/Service';

class Controller {
  constructor(private service: Service) {}

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

  private invalidArgumentsResponse = (res: Response, error: string) => {
    this.setContentTypeJson(res);
    res.status(400).json({ error });
  }

  private swapCreatedResponse = (res: Response, data: any) => {
    this.setContentTypeJson(res);
    res.status(201).json(data);
  }

  private setContentTypeJson = (res: Response) => {
    res.set('Content-Type', 'application/json');
  }
}

export default Controller;
