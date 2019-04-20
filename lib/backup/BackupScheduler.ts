import { readFileSync } from 'fs';
import { scheduleJob } from 'node-schedule';
import { Storage, Bucket } from '@google-cloud/storage';
import Logger from '../Logger';
import Report from '../report/Report';

type BackupConfig = {
  email: string;
  privatekeypath: string;

  bucketname: string;

  // The interval has to be a cron schedule expression
  interval: string;

  // If set, the database of the backend will also be backed up
  backenddbpath: string;
};

class BackupScheduler {
  private bucket?: Bucket;

  constructor(
    private logger: Logger,
    private dbpath: string,
    private config: BackupConfig,
    private report: Report) {

    if (
      config.email === '' ||
      config.privatekeypath === '' ||
      config.bucketname === ''
    ) {
      logger.warn('Disabled backups because of incomplete configuration');
      return;
    }

    const storage = new Storage({
      credentials: {
        client_email: config.email,
        private_key: readFileSync(config.privatekeypath, 'utf-8'),
      },
    });

    this.bucket = storage.bucket(config.bucketname);

    scheduleJob(this.config.interval, async (date) => {
      await this.uploadDatabases(date);
      await this.uploadReport();
    });
  }

  public uploadDatabases = async (date: Date) => {
    if (!this.bucket) {
      throw 'Backups are disabled because of incomplete configuration';
    }

    const dateString = this.getDate(date);
    this.logger.silly(`Doing database backup at: ${dateString}`);

    await this.uploadFile(this.dbpath, dateString, true);

    if (this.config.backenddbpath !== '') {
      await this.uploadFile(this.config.backenddbpath, dateString, false);
    }
  }

  public uploadReport = async () => {
    if (!this.bucket) {
      return;
    }

    const file = this.bucket.file('report.csv');
    const data = await this.report.generate();

    await file.save(data);

    this.logger.debug('Uploaded report');
  }

  private uploadFile = async (fileName: string, date: string, isMiddleware: boolean) => {
    try {
      await this.bucket!.upload(fileName, {
        destination: `${isMiddleware ? 'middleware' : 'backend'}/database-${date}.db`,
      });

      this.logger.debug(`Uploaded file ${fileName}`);
    } catch (error) {
      this.logger.warn(`Could not upload file: ${error}`);
      throw error;
    }
  }

  private getDate = (date: Date) => {
    return `${date.getFullYear()}${this.addLeadingZeros(date.getMonth())}${this.addLeadingZeros(date.getDay())}` +
      `-${this.addLeadingZeros(date.getHours())}${this.addLeadingZeros(date.getMinutes())}`;
  }

  /**
   * Adds a leading 0 to the provided number if it is smalled than 10
   */
  private addLeadingZeros = (number: number) => {
    return `${number}`.padStart(2, '0');
  }
}

export default BackupScheduler;
export { BackupConfig };
