import { Bucket, File } from '@google-cloud/storage';
import { mock, instance, verify, deepEqual, when, anything, anyString } from 'ts-mockito';
import Logger from '../../../lib/Logger';
import Swap from '../../../lib/db/models/Swap';
import Report from '../../../lib/report/Report';
import SwapRepository from '../../../lib/service/SwapRepository';
import ReverseSwapRepository from '../../../lib/service/ReverseSwapRepository';
import BackupScheduler, { BackupConfig } from '../../../lib/backup/BackupScheduler';

describe('BackupScheduler', () => {
  const dbPath = 'middleware.db';
  const backendDbPath = 'backend.db';

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

  const fileMock = mock(File);

  const bucketMock = mock(Bucket);
  when(bucketMock.file('report.csv')).thenReturn(instance(fileMock));
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
    report,
  );

  backupScheduler['bucket'] = bucket;

  it('should upload the databases', async () =>  {
    const date = new Date();
    const dateString = backupScheduler['getDate'](date);

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

    verify(fileMock.save(csv)).once();
  });
});
