import { expect } from 'chai';
import { Bucket, File } from '@google-cloud/storage';
import { mock, instance, verify, deepEqual, when, anything, anyString } from 'ts-mockito';
import Logger from '../../../lib/Logger';
import Swap from '../../../lib/db/models/Swap';
import Report from '../../../lib/report/Report';
import BoltzClient from '../../../lib/boltz/BoltzClient';
import SwapRepository from '../../../lib/service/SwapRepository';
import ReverseSwapRepository from '../../../lib/service/ReverseSwapRepository';
import BackupScheduler, { BackupConfig } from '../../../lib/backup/BackupScheduler';

describe('BackupScheduler', () => {
  const dbPath = 'middleware.db';
  const backendDbPath = 'backend.db';

  const channelBackupCurrency = 'BTC';
  const channelBackupDate = new Date();

  let emitChannelBackup: any;

  const swapMock = mock(Swap);
  when(swapMock.fee).thenReturn(780);
  when(swapMock.orderSide).thenReturn(0);
  when(swapMock.pair).thenReturn('BTC/BTC');
  when(swapMock.createdAt).thenReturn('2019-04-19 09:21:01.156 +00:00');

  const swapRepositoryMock = mock(SwapRepository);
  when(swapRepositoryMock.getSwaps(anything())).thenResolve([instance(swapMock)]);
  const swapRepository = instance(swapRepositoryMock);

  const reverseSwapRepositoryMock = mock(ReverseSwapRepository);
  when(reverseSwapRepositoryMock.getReverseSwaps(anything())).thenResolve([]);
  const reverseSwapRepository = instance(reverseSwapRepositoryMock);

  const boltzClientMock = mock(BoltzClient);
  when(boltzClientMock.on('channel.backup', anything())).thenCall((_, callback) => {
    emitChannelBackup = callback;
  });
  const boltzClient = instance(boltzClientMock);

  const reportFileMock = mock(File);
  const channelBackupFileMock = mock(File);

  const bucketMock = mock(Bucket);
  when(bucketMock.file('report.csv')).thenReturn(instance(reportFileMock));
  when(bucketMock.file(`lnd/${channelBackupCurrency}/multiChannelBackup-${BackupScheduler['getDate'](channelBackupDate)}`))
    .thenReturn(instance(channelBackupFileMock));
  const bucket = instance(bucketMock);

  const report = new Report(
    swapRepository,
    reverseSwapRepository,
  );

  const backupConfig: BackupConfig = {
    email: '',
    privatekeypath: '',

    bucketname: '',

    interval: '',

    backenddbpath: backendDbPath,
  };

  const backupScheduler = new BackupScheduler(
    Logger.disabledLogger,
    dbPath,
    backupConfig,
    boltzClient,
    report,
  );

  backupScheduler['bucket'] = bucket;

  it('should format date correctly', () => {
    const date = new Date(1556457455724);
    const dateString = BackupScheduler['getDate'](date);

    const addLeadingZeros = BackupScheduler['addLeadingZeros'];

    expect(dateString).to.be.equal(
      `${date.getFullYear()}${addLeadingZeros(date.getMonth())}${addLeadingZeros(date.getDate())}` +
      `-${addLeadingZeros(date.getHours())}${addLeadingZeros(date.getMinutes())}`,
    );
  });

  it('should upload the databases', async () =>  {
    const date = new Date();
    const dateString = BackupScheduler['getDate'](date);

    await backupScheduler.uploadDatabases(date);

    verify(bucketMock.upload(anyString(), anything())).twice();

    verify(bucketMock.upload(dbPath, deepEqual({
      destination: `middleware/database-${dateString}.db`,
    }))).once();

    verify(bucketMock.upload(backendDbPath, deepEqual({
      destination: `backend/database-${dateString}.db`,
    }))).once();
  });

  it('should not upload backend database if path is not specified', async () => {
    backupConfig.backenddbpath = '';

    await backupScheduler.uploadDatabases(new Date());

    verify(bucketMock.upload(anyString(), anything())).thrice();
    verify(bucketMock.upload(dbPath, anything())).twice();
  });

  it('should upload the report', async () => {
    await backupScheduler.uploadReport();

    const csv = await report.generate();

    verify(reportFileMock.save(csv)).once();
    verify(reportFileMock.save(anyString())).once();
  });

  it('should upload LND multi channel backups', async () => {
    const channelBackup = 'b3be5ae30c223333b693a1f310e92edbae2c354abfd8a87ec2c36862c576cde4';

    backupScheduler['subscribeChannelBackups']();
    emitChannelBackup(channelBackupCurrency, channelBackup, channelBackupDate);

    verify(channelBackupFileMock.save(channelBackup)).once();
    verify(channelBackupFileMock.save(anyString())).once();
  });
});
