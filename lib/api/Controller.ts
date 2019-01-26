import { Request, Response } from 'express';
import Service from '../service/Service';
import Logger from '../Logger';
import { stringify } from '../Utils';

class Controller {
  // A map between the ids and HTTP responses of all pending swaps
  private pendingSwaps = new Map<string, Response>();

  constructor(private logger: Logger, private service: Service) {
    this.service.on('swap.update', (id: string, message: object) => {
      const response = this.pendingSwaps.get(id);

      if (response) {
        this.logger.debug(`Swap ${id} update: ${stringify(message)}`);
        response.write(`data: ${JSON.stringify(message)}\n\n`);
      }
    });
  }

  public getPairs = async (_req: Request, res: Response) => {
    const response = this.service.getPairs();
    this.successResponse(res, response);
  }

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
        { name: 'orderSide', type: 'string' },
        { name: 'invoice', type: 'string' },
        { name: 'refundPublicKey', type: 'string' },
      ]);

      const response = await this.service.createSwap(pairId, orderSide, invoice, refundPublicKey);

      this.logger.verbose(`Created new swap with id: ${response.id}`);
      this.logger.silly(`Swap ${response.id}: ${stringify(response)}`);

      this.swapCreatedResponse(res, response);
    } catch (error) {
      this.writeErrorResponse(res, error);
    }
  }

  public createReverseSwap = async (req: Request, res: Response) => {
    try {
      const { pairId, orderSide, claimPublicKey, amount } = this.validateBody(req.body, [
        { name: 'pairId', type: 'string' },
        { name: 'orderSide', type: 'string' },
        { name: 'claimPublicKey', type: 'string' },
        { name: 'amount', type: 'number' },
      ]);

      const response = await this.service.createReverseSwap(pairId, orderSide, claimPublicKey, amount);

      this.logger.verbose(`Created reverse swap with id: ${response.id}`);
      this.logger.silly(`Reverse swap ${response.id}: ${stringify(response)}`);

      this.swapCreatedResponse(res, response);
    } catch (error) {
      this.writeErrorResponse(res, error);
    }
  }

  public swapStatus = (req: Request, res: Response) => {
    try {
      const { id } = this.validateBody(req.query, [
        { name: 'id', type: 'string' },
      ]);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });

      this.pendingSwaps.set(id, res);

      res.on('close', () => {
        this.pendingSwaps.delete(id);
      });
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
    this.logger.warn(`Request failed: ${error}`);

    this.setContentTypeJson(res);
    res.status(400).json({ error });
  }

  private setContentTypeJson = (res: Response) => {
    res.set('Content-Type', 'application/json');
  }
}

export default Controller;
