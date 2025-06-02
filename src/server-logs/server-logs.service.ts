import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
  }

  async getLogs(lastNLines: number, filters: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      pm2.connect(err => {
        if (err) {
          console.log('Error connecting to PM2:', err);
          return reject('Failed to connect to PM2');
        }

        pm2.describe(this.processName, (err, processDescription) => {
          if (err || !processDescription.length) {
            console.log('Error describing PM2 process:', err || 'No process description found');
            pm2.disconnect();
            return resolve('No logs found');
          }

          const logFilePath = processDescription[0].pm2_env.pm_out_log_path;
          if (!logFilePath) {
            console.log('Log file path not found in PM2 process description');
            pm2.disconnect();
            return resolve('No logs found');
          }

          try {
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
                  console.log('Error compiling regex pattern:', err);
                  return null;
                }
              })
              .filter(Boolean) as RegExp[];

            const filteredLines = lastLines.filter(line => regexes.some(regex => regex.test(line)));

            pm2.disconnect();
            return resolve(filteredLines.join('\n') || 'No matching logs found');
          } catch (err) {
            console.log('Error reading log file:', err);
            pm2.disconnect();
            return reject('Failed to read log file');
          }
        });
      });
    });
  }
}
