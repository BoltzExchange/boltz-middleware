import fs from 'fs';
import grpc from 'grpc';
import BaseClient from '../BaseClient';
import Logger from '../Logger';
import Errors from './Errors';
import * as boltzrpc from '../proto/boltzrpc_pb';
import { BoltzClient as GrpcClient } from '../proto/boltzrpc_grpc_pb';
import { ClientStatus } from '../consts/ClientStatus';
import { stringify } from '../Utils';

/**
 * The configurable options of the Boltz client
 */
type BoltzConfig = {
  host: string;
  port: number;
  certpath: string;
};

interface GrpcResponse {
  toObject: Function;
}

interface BoltzMethodIndex extends GrpcClient {
  [methodName: string]: Function;
}

class BoltzClient extends BaseClient {
  private uri!: string;
  private credentials!: grpc.ChannelCredentials;

  private lightning!: GrpcClient | BoltzMethodIndex;
  private meta!: grpc.Metadata;

  constructor(private logger: Logger, config: BoltzConfig) {
    super();

    const { host, port, certpath } = config;

    if (fs.existsSync(certpath)) {
      this.uri = `${host}:${port}`;

      const cert = fs.readFileSync(certpath);
      this.credentials = grpc.credentials.createSsl(cert);

      this.meta = new grpc.Metadata();
    } else {
      throw(Errors.COULD_NOT_FIND_FILES(certpath));
    }
  }

  /**
   * Connects to Boltz
   */
  public connect = async () => {
    if (!this.isConnected()) {
      this.lightning = new GrpcClient(this.uri, this.credentials);

      try {
        const getInfo = await this.getInfo();

        this.logger.info('Connected to Boltz');
        this.logger.verbose(`Boltz status: ${stringify(getInfo)}`);

        this.setClientStatus(ClientStatus.Connected);
        this.clearReconnectTimer();

      } catch (error) {
        this.logger.error(`Could not connect to Boltz: ${error.message}`);
        this.logger.verbose(`Retrying in ${this.RECONNECT_INTERVAL} ms`);

        this.setClientStatus(ClientStatus.Disconnected);
        this.reconnectionTimer = setTimeout(this.connect, this.RECONNECT_INTERVAL);
      }
    }
  }

  /**
   * Disconnects and stops trying to reconnect
   */
  public disconnect = async () => {
    this.clearReconnectTimer();

    this.lightning.close();
  }

  private unaryCall = <T, U>(methodName: string, params: T): Promise<U> => {
    return new Promise((resolve, reject) => {
      (this.lightning as BoltzMethodIndex)[methodName](params, this.meta, (err: grpc.ServiceError, response: GrpcResponse) => {
        if (err) {
          reject(err);
        } else {
          resolve(response.toObject());
        }
      });
    });
  }

  /**
   * Gets general information about this Boltz instance and the nodes it is connected to
   */
  public getInfo = () => {
    return this.unaryCall<boltzrpc.GetInfoRequest, boltzrpc.GetInfoResponse.AsObject>('getInfo', new boltzrpc.GetInfoRequest());
  }

  /**
   * Gets a hex encoded transaction from a transaction hash on the specified network
   */
  public getTransaction = (currency: string, transactionHash: string) => {
    const request = new boltzrpc.GetTransactionRequest();

    request.setCurrency(currency);
    request.setTransactionHash(transactionHash);

    return this.unaryCall<boltzrpc.GetTransactionRequest, boltzrpc.GetTransactionResponse>('getTransaction', request);
  }

  /**
   * Broadcasts a hex encoded transaction on the specified network
   */
  public broadcastTransaction = (currency: string, transactionHex: string) => {
    const request = new boltzrpc.BroadcastTransactionRequest();

    request.setCurrency(currency);
    request.setTransactionHex(transactionHex);

    return this.unaryCall<boltzrpc.BroadcastTransactionRequest, boltzrpc.BroadcastTransactionResponse>('broadcastTransaction', request);
  }

  /**
   * Creates a new Swap from the chain to Lightning
   */
  public createSwap = (_pairId: string, orderSide: boltzrpc.OrderSide, invoice: string, refundPublicKey: string, outputType?: boltzrpc.OutputType) => {
    const request = new boltzrpc.CreateSwapRequest();

    // request.setPairId(pairId);
    request.setOrderSide(orderSide);
    request.setInvoice(invoice);
    request.setRefundPublicKey(refundPublicKey);

    if (outputType) {
      request.setOutputType(outputType);
    }

    return this.unaryCall<boltzrpc.CreateSwapRequest, boltzrpc.CreateSwapResponse>('createSwap', request);
  }
}

export default BoltzClient;
export { BoltzConfig };
