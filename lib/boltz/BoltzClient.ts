import fs from 'fs';
import grpc, { ClientReadableStream } from 'grpc';
import Errors from './Errors';
import Logger from '../Logger';
import { stringify } from '../Utils';
import BaseClient from '../BaseClient';
import { ClientStatus } from '../consts/Enums';
import * as boltzrpc from '../proto/boltzrpc_pb';
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

  on(event: 'transaction', listener: (outputAddress: string, transactionHash: string, amountReceived: number, confirmed: boolean) => void): this;
  emit(event: 'transaction', outputAddress: string, transactionHash: string, amountReceived: number, confirmed: boolean): boolean;

  on(even: 'invoice.paid', listener: (invoice: string, routingFee: number) => void): this;
  emit(event: 'invoice.paid', invoice: string, routingFee: number): boolean;

  on(event: 'invoice.failedToPay', listener: (invoice: string) => void): this;
  emit(event: 'invoice.failedToPay', invoice: string): boolean;

  on(even: 'invoice.settled', listener: (invoice: string, preimage: string) => void): this;
  emit(event: 'invoice.settled', invoice: string, preimage: string): boolean;

  on(event: 'claim', listener: (lockupTransactionHash: string, minerFee: number) => void): this;
  emit(event: 'claim', lockupTransactionHash: string, minerFee: number): boolean;

  on(event: 'abort', listener: (invoice: string) => void): this;
  emit(event: 'abort', invoice: string): boolean;

  on(event: 'refund', listener: (lockupTransactionHash: string, minerFee: number) => void): this;
  emit(event: 'refund', lockupTransactionHash: string, minerFee: number): boolean;

  on(event: 'channel.backup', listener: (currency: string, channelBackup: string) => void): this;
  emit(event: 'channel.backup', currency: string, channelBackup: string): boolean;
}

class BoltzClient extends BaseClient {
  private uri!: string;
  private credentials!: grpc.ChannelCredentials;

  private boltz!: GrpcClient | BoltzMethodIndex;
  private meta!: grpc.Metadata;

  private channelBackupSubscription?: ClientReadableStream<boltzrpc.ChannelBackup>;
  private invoicesSubscription?: ClientReadableStream<boltzrpc.SubscribeInvoicesResponse>;
  private swapEventsSubscription?: ClientReadableStream<boltzrpc.SubscribeSwapEventsResponse>;
  private transactionSubscription?: ClientReadableStream<boltzrpc.SubscribeTransactionsResponse>;

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
  public createSwap = (
    baseCurrency: string,
    quoteCurrency: string,
    orderSide: boltzrpc.OrderSide,
    invoice: string,
    expectedAmount: number,
    refundPublicKey: string,
    outputType: boltzrpc.OutputType,
    timeoutBlockDelta: number,
    acceptZeroConf: boolean,
  ) => {
    const request = new boltzrpc.CreateSwapRequest();

    request.setInvoice(invoice);
    request.setOrderSide(orderSide);
    request.setOutputType(outputType);
    request.setBaseCurrency(baseCurrency);
    request.setQuoteCurrency(quoteCurrency);
    request.setExpectedAmount(expectedAmount);
    request.setAcceptZeroConf(acceptZeroConf);
    request.setRefundPublicKey(refundPublicKey);
    request.setTimeoutBlockDelta(timeoutBlockDelta);

    return this.unaryCall<boltzrpc.CreateSwapRequest, boltzrpc.CreateSwapResponse.AsObject>('createSwap', request);
  }

  /**
   * Creates a new reverse Swap from Lightning to the chain
   */
  public createReverseSwap = (
    baseCurrency: string,
    quoteCurrency: string,
    orderSide: boltzrpc.OrderSide,
    invoiceAmount: number,
    onchainAmount: number,
    claimPublicKey: string,
    timeoutBlockDelta: number,
  ) => {
    const request = new boltzrpc.CreateReverseSwapRequest();

    request.setBaseCurrency(baseCurrency);
    request.setQuoteCurrency(quoteCurrency);
    request.setOrderSide(orderSide);
    request.setInvoiceAmount(invoiceAmount);
    request.setOnchainAmount(onchainAmount);
    request.setClaimPublicKey(claimPublicKey);
    request.setTimeoutBlockDelta(timeoutBlockDelta);

    return this.unaryCall<boltzrpc.CreateReverseSwapRequest, boltzrpc.CreateReverseSwapResponse.AsObject>('createReverseSwap', request);
  }

  /**
   * Subscribes to a stream of confirmed transactions to addresses that were specified with "ListenOnAddress"
   */
  private subscribeTransactions = () => {
    if (this.transactionSubscription) {
      this.transactionSubscription.cancel();
    }

    this.transactionSubscription = this.boltz.subscribeTransactions(new boltzrpc.SubscribeTransactionsRequest(), this.meta)
      .on('data', (response: boltzrpc.SubscribeTransactionsResponse) => {
        this.logger.debug(`Found transaction to address ${response.getOutputAddress()} ${response.getConfirmed() ? 'confirmed' : 'in mempool'}:` +
          ` ${response.getTransactionHash()}`);

        this.emit('transaction', response.getOutputAddress(), response.getTransactionHash(), response.getAmountReceived(), response.getConfirmed());
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Transaction subscription errored: ${stringify(error)}`);
        await this.startReconnectTimer();
      });
  }

  /**
   * Subscribes to a stream of settled invoices and those paid by Boltz
   */
  private subscribeInvoices = () => {
    if (this.invoicesSubscription) {
      this.invoicesSubscription.cancel();
    }

    this.invoicesSubscription = this.boltz.subscribeInvoices(new boltzrpc.SubscribeInvoicesRequest(), this.meta)
      .on('data', (response: boltzrpc.SubscribeInvoicesResponse) => {
        const invoice = response.getInvoice();

        switch (response.getEvent()) {
          case boltzrpc.InvoiceEvent.PAID:
            this.logger.debug(`Invoice paid: ${invoice}`);
            this.emit('invoice.paid', invoice, response.getRoutingFee());

            break;

          case boltzrpc.InvoiceEvent.FAILED_TO_PAY:
            this.logger.debug(`Failed to pay invoice: ${invoice}`);
            this.emit('invoice.failedToPay', invoice);

            break;

          case boltzrpc.InvoiceEvent.SETTLED:
            this.logger.debug(`Invoice settled: ${invoice}`);
            this.emit('invoice.settled', invoice, response.getPreimage());

            break;
        }
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Invoice subscription errored: ${stringify(error)}`);
        await this.startReconnectTimer();
      });
  }

  /**
   * Subscribes to a stream of swap events
   */
  private subscribeSwapEvents = () => {
    if (this.swapEventsSubscription) {
      this.swapEventsSubscription.cancel();
    }

    this.swapEventsSubscription = this.boltz.subscribeSwapEvents(new boltzrpc.SubscribeSwapEventsRequest(), this.meta)
      .on('data', (response: boltzrpc.SubscribeSwapEventsResponse) => {
        const event = response.getEvent();

        switch (event) {
          case boltzrpc.SwapEvent.CLAIM:
            const claimDetails = response.getClaimDetails()!;

            const claimTransactionHash = claimDetails.getLockupTransactionHash();

            this.logger.debug(`Claimed lockup transaction: ${claimTransactionHash}`);
            this.emit('claim', claimTransactionHash, claimDetails.getMinerFee());
            break;

          case boltzrpc.SwapEvent.ABORT:
            const abortDetails = response.getAbortDetails()!;

            const invoice = abortDetails.getInvoice();

            this.logger.debug(`Aborted swap ${invoice}`);
            this.emit('abort', invoice);
            break;

          case boltzrpc.SwapEvent.REFUND:
            const refundDetails = response.getRefundDetails()!;

            const refundTransactionHash = refundDetails.getLockupTransactionHash();

            this.logger.debug(`Refunded lockup transaction: ${refundTransactionHash}`);
            this.emit('refund', refundTransactionHash, refundDetails.getMinerFee());
            break;
        }
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Swap events subscription errored: ${stringify(error)}`);
        await this.startReconnectTimer();
      });
  }

  /**
   * Subscribes to a stream of channel backups
   */
  private subscribeChannelBackups = () => {
    if (this.channelBackupSubscription) {
      this.channelBackupSubscription.cancel();
    }

    this.channelBackupSubscription = this.boltz.subscribeChannelBackups(new boltzrpc.SubscribeChannelBackupsRequest, this.meta)
      .on('data', (response: boltzrpc.ChannelBackup) => {
        this.logger.debug(`New ${response.getCurrency()} channel backup`);
        this.emit('channel.backup', response.getCurrency(), response.getMultiChannelBackup());
      })
      .on('error', async (error) => {
        this.emit('status.updated', ConnectionStatus.Disconnected);

        this.logger.error(`Channel backup subscription errored: ${stringify(error)}`);
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

      this.subscribeSwapEvents();
      this.subscribeInvoices();
      this.subscribeTransactions();
      this.subscribeChannelBackups();
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
