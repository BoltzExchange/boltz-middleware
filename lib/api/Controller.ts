import { Request, Response } from 'express';
import Service from '../service/Service';

class Controller {
  constructor(private service: Service) {}

  // TODO: make sure all required arguments were provided
  public createSwap = async (req: Request, res: Response) => {
    const { pairId, orderSide, invoice, refundPublicKey } = req.body;

    const response = await this.service.createSwap(pairId, orderSide, invoice, refundPublicKey);

    this.swapCreatedResponse(res, response);
  }

  private swapCreatedResponse = (res: Response, data: any) => {
    res.set('Content-Type', 'application/json');
    res.status(201).json(data);
  }
}

export default Controller;
