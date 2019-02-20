import fs from 'fs';
import grpc, { ClientReadableStream } from 'grpc';
import Errors from './Errors';
import Logger from '../Logger';
import { stringify } from '../Utils';
import BaseClient from '../BaseClient';
import * as boltzrpc from '../proto/boltzrpc_pb';
import { ClientStatus } from '../consts/ClientStatus';
import { BoltzClient as GrpcClient } from '../proto/boltzrpc_grpc_pb';

/**
 * The configurable options of the Boltz client
 */
type BoltzConfig = {
  host: string;
  port: number;
  certpath: string;
};

enum ConnectionStatus {
  Connected,
  Disconnected,
}

interface GrpcResponse {
  toObject: Function;
}

interface BoltzMethodIndex extends GrpcClient {
  [methodName: string]: Function;
}

interface BoltzClient {
  on(event: 'status.updated', listener: (status: ConnectionStatus) => void): this;
  emit(event: 'status.updated', status: ConnectionStatus): boolean;

  on(event: 'transaction.confirmed', listener: (transactionHash: string, outputAddress: string) => void): this;
  emit(event: 'transaction.confirmed', transactionHash: string, outputAddress: string): boolean;

  on(even: 'invoice.paid', listener: (invoice: string) => void): this;
  emit(event: 'invoice.paid', invoice: string): boolean;

  on(even: 'invoice.settled', listener: (invoice: string, preimage: string) => void): this;
  emit(event: 'invoice.settled', invoice: string, preimage: string): boolean;
}

class BoltzClient extends BaseClient {
  private uri!: string;
  private credentials!: grpc.ChannelCredentials;

  private boltz!: GrpcClient | BoltzMethodIndex;
  private meta!: grpc.Metadata;

  private transactionSubscription?: ClientReadableStream<boltzrpc.SubscribeTransactionsResponse>;
  private invoicesSubscription?: ClientReadableStream<boltzrpc.SubscribeInvoicesResponse>;

  private isReconnecting = false;

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
   * Connects to Boltz and subscribes to confirmed transactions and paid invoices afterwards
   */
  public connect = async () => {
    if (!this.isConnected()) {
      this.boltz = new GrpcClient(this.uri, this.credentials);

      await this.startReconnectTimer();
    }
  }

  /**
   * Disconnects and stops trying to reconnect
   */
  public disconnect = async () => {
    this.clearReconnectTimer();

    if (this.transactionSubscription) {
      this.transactionSubscription.cancel();
    }

    this.boltz.close();
  }

  /**
   * Gets general information about this Boltz instance and the nodes it is connected to
   */
  public getInfo = () => {
    return this.unaryCall<boltzrpc.GetInfoRequest, boltzrpc.GetInfoResponse.AsObject>('getInfo', new boltzrpc.GetInfoRequest());
  }

  /**
   * Gets the balance for either all wallets or just a single one if specified
   */
  public getBalance = (currency?: string) => {
    const request = new boltzrpc.GetBalanceRequest();

    if (currency) {
      request.setCurrency(currency);
    }

    return this.unaryCall<boltzrpc.GetBalanceRequest, boltzrpc.GetBalanceResponse.AsObject>('getBalance', request);
  }

  /**
   * Gets a new address of a specified wallet. The "type" parameter is optional and defaults to "OutputType.LEGACY"
   */
  public newAddress = (currency: string, outputType?: boltzrpc.OutputType) => {
    const request = new boltzrpc.NewAddressRequest();

    request.setCurrency(currency);

    if (outputType) {
      request.setType(outputType);
    }

    return this.unaryCall<boltzrpc.NewAddressRequest, boltzrpc.NewAddressResponse.AsObject>('newAddress', request);
  }

  /**
   * Gets a hex encoded transaction from a transaction hash on the specified network
   */
  public getTransaction = (currency: string, transactionHash: string) => {
    const request = new boltzrpc.GetTransactionRequest();

    request.setCurrency(currency);
    request.setTransactionHash(transactionHash);

    return this.unaryCall<boltzrpc.GetTransactionRequest, boltzrpc.GetTransactionResponse.AsObject>('getTransaction', request);
  }

  /**
   * Gets a fee estimation in satoshis per vbyte for either all currencies or just a single one if specified
   */
  public getFeeEstimation = (currency?: string, blocks?: number) => {
    const request = new boltzrpc.GetFeeEstimationRequest();

    request.setCurrency(currency || '');
    request.setBlocks(blocks || 0);

    return this.unaryCall<boltzrpc.GetFeeEstimationRequest, boltzrpc.GetFeeEstimationResponse.AsObject>('getFeeEstimation', request);
  }

  /**
   * Broadcasts a hex encoded transaction on the specified network
   */
  public broadcastTransaction = (currency: string, transactionHex: string) => {
    const request = new boltzrpc.BroadcastTransactionRequest();

    request.setCurrency(currency);
    request.setTransactionHex(transactionHex);

    return this.unaryCall<boltzrpc.BroadcastTransactionRequest, boltzrpc.BroadcastTransactionResponse.AsObject>('broadcastTransaction', request);
  }

  /**
   * Adds an entry to the list of addresses SubscribeTransactions listens to
   */
  public listenOnAddress = (currency: string, address: string) => {
    const request = new boltzrpc.ListenOnAddressRequest();

    request.setCurrency(currency);
    request.setAddress(address);

    return this.unaryCall<boltzrpc.ListenOnAddressRequest, boltzrpc.ListenOnAddressResponse.AsObject>('listenOnAddress', request);
  }

  /**
   * Creates a new Swap from the chain to Lightning
   */
  public createSwap = (baseCurrency: string, quoteCurrency: string, orderSide: boltzrpc.OrderSide, rate: number,
    invoice: string, refundPublicKey: string, outputType?: boltzrpc.OutputType) => {

    const request = new boltzrpc.CreateSwapRequest();

    request.setRate(rate);
    request.setInvoice(invoice);
    request.setOrderSide(orderSide);
    request.setTimeoutBlockNumber(10);
    request.setBaseCurrency(baseCurrency);
    request.setQuoteCurrency(quoteCurrency);
    request.setRefundPublicKey(refundPublicKey);

    if (outputType) {
      request.setOutputType(outputType);
    }

    return this.unaryCall<boltzrpc.CreateSwapRequest, boltzrpc.CreateSwapResponse.AsObject>('createSwap', request);
  }

  /**
   * Creates a new reverse Swap from Lightning to the chain
   */
  public createReverseSwap = (baseCurrency: string, quoteCurrency: string, orderSide: boltzrpc.OrderSide, rate: number,
    claimPublicKey: string, amount: number) => {

    const request = new boltzrpc.CreateReverseSwapRequest();

    request.setRate(rate);
    request.setAmount(amount);
    request.setOrderSide(orderSide);
    request.setTimeoutBlockNumber(10);
    request.setBaseCurrency(baseCurrency);
    request.setQuoteCurrency(quoteCurrency);
    request.setClaimPublicKey(claimPublicKey);

    return this.unaryCall<boltzrpc.CreateReverseSwapRequest, boltzrpc.CreateReverseSwapResponse.AsObject>('createReverseSwap', request);
  }

  /**
   * Subscribes to a stream of confirmed transactions to addresses that were specified with "ListenOnAddress"
   */
  public subscribeTransactions = () => {
    if (this.transactionSubscription) {
      this.transactionSubscription.cancel();
    }

    this.transactionSubscription = this.boltz.subscribeTransactions(new boltzrpc.SubscribeTransactionsRequest(), this.meta)
      .on('data', (response: boltzrpc.SubscribeTransactionsResponse) => {
        this.logger.silly(`Found transaction to address ${response.getOutputAddress()} confirmed: ${response.getTransactionHash()}`);
        this.emit('transaction.confirmed', response.getTransactionHash(), response.getOutputAddress());
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Transaction subscription errored: ${stringify(error)}`);
        await this.startReconnectTimer();
      });
  }

  /**
   * Subscribes to a stream of invoices paid by Boltz
   */
  public subscribeInvoices = () => {
    if (this.invoicesSubscription) {
      this.invoicesSubscription.cancel();
    }

    this.invoicesSubscription = this.boltz.subscribeInvoices(new boltzrpc.SubscribeInvoicesRequest(), this.meta)
      .on('data', (response: boltzrpc.SubscribeInvoicesResponse) => {
        const invoice = response.getInvoice();

        if (response.getEvent() === boltzrpc.InvoiceEvent.PAID) {
          this.logger.silly(`Invoice paid: ${invoice}`);
          this.emit('invoice.paid', invoice);
        } else {
          this.logger.silly(`Invoice settled: ${invoice}`);
          this.emit('invoice.settled', invoice, response.getPreimage());
        }
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Invoice subscription errored: ${stringify(error)}`);
        await this.startReconnectTimer();
      });
  }

  private startReconnectTimer = async () => {
    if (!this.isReconnecting) {
      this.isReconnecting = true;

      await this.reconnect();
    }
  }

  private reconnect = async () => {
    try {
      const getInfo = await this.getInfo();

      this.emit('status.updated', ConnectionStatus.Connected);

      this.logger.info('Connected to Boltz');
      this.logger.verbose(`Boltz status: ${stringify(getInfo)}`);

      this.setClientStatus(ClientStatus.Connected);
      this.clearReconnectTimer();

      this.isReconnecting = false;

      this.subscribeTransactions();
      this.subscribeInvoices();
    } catch (error) {
      this.logger.error(`Could not connect to Boltz: ${error.message}`);
      this.logger.verbose(`Retrying in ${this.RECONNECT_INTERVAL} ms`);

      this.setClientStatus(ClientStatus.Disconnected);
      this.reconnectionTimer = setTimeout(this.reconnect, this.RECONNECT_INTERVAL);
    }
  }

  private unaryCall = <T, U>(methodName: string, params: T): Promise<U> => {
    return new Promise((resolve, reject) => {
      (this.boltz as BoltzMethodIndex)[methodName](params, this.meta, (err: grpc.ServiceError, response: GrpcResponse) => {
        if (err) {
          reject(err);
        } else {
          resolve(response.toObject());
        }
      });
    });
  }
}

export default BoltzClient;
export { BoltzConfig, ConnectionStatus };
