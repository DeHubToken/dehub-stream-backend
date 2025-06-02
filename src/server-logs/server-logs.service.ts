import { Injectable } from '@nestjs/common';
import { config } from 'config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// import * as pm2 from 'pm2';
// import pm2 from 'pm2';
const pm2 = require('pm2');

@Injectable()
export class ServerLogsService {
  private readonly logFilePath: string;
  private readonly processName: string;
  private pm2Instance: any;

  constructor() {
    const isWindows = os.platform() === 'win32';
    this.logFilePath = isWindows
      ? path.join(os.homedir(), '.pm2', 'logs', 'main-out.log')
      : '/root/.pm2/logs/api-prod-out.log';
    this.processName = isWindows ? 'main' : 'api_prod';

    console.log('Using log file:', this.logFilePath);
    console.log('Using process name:', this.processName);
    // console.log("Pm2 stuff", pm2);
  }

  private async initPm2() {
    if (!this.pm2Instance) {
      this.pm2Instance = await import('pm2');
    }
    return this.pm2Instance;
  }

  async getLogs(lastNLines: number, filters: string[]): Promise<string> {
    //   console.log("Pm2 object:", pm2); // Debug PM2 object
    // const pm2 = await this.initPm2();
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) {
          return reject('Failed to connect to PM2');
        }

        pm2.describe(this.processName, (err, processDescription) => {
          if (err || !processDescription.length) {
            pm2.disconnect();
            return resolve('No logs found');
          }

          const logFilePath = processDescription[0].pm2_env.pm_out_log_path;
          if (!logFilePath) {
            pm2.disconnect();
            return resolve('No logs found');
          }

          const data = fs.readFileSync(logFilePath, 'utf8');
          const lines = data.trim().split('\n');
          const lastLines = lines.slice(-lastNLines);

          if (filters.length === 0) {
            pm2.disconnect();
            return resolve(lastLines.join('\n'));
          }

          const regexes = filters
            .map(pattern => {
              try {
                return new RegExp(pattern);
              } catch (err) {
                return null;
              }
            })
            .filter(Boolean) as RegExp[];

          const filteredLines = lastLines.filter(line => regexes.some(regex => regex.test(line)));

          pm2.disconnect();
          return resolve(filteredLines.join('\n') || 'No matching logs found');
        });
      });
    });
  }
}
