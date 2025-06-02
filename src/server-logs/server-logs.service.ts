import { Injectable } from '@nestjs/common';
import { config } from 'config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class ServerLogsService {
  //   private readonly logFilePath = config.isDevMode ? '~/.pm2/logs/main-out.log' : '~/.pm2/logs/api-prod-out.log';
  //   private readonly logFilePath = '~/.pm2/logs/main-out.log';
  //   private readonly logFilePath = '~/.pm2/logs/api-prod-out.log';
  private readonly logFilePath: string;

  constructor() {
    const isWindows = os.platform() === 'win32';
    this.logFilePath = isWindows
      ? path.join(os.homedir(), '.pm2', 'logs', 'main-out.log')
      : '/root/.pm2/logs/api-prod-out.log';

    console.log('Using log file:', this.logFilePath);
  }

  async getLogs(lastNLines: number, filters: string[]): Promise<string> {
    console.log(config.isDevMode, this.logFilePath, fs.existsSync(this.logFilePath));
    if (!fs.existsSync(this.logFilePath)) {
      return 'No logs found';
    }

    const data = fs.readFileSync(this.logFilePath, 'utf8');
    const lines = data.trim().split('\n');
    const lastLines = lines.slice(-lastNLines);

    if (filters.length === 0) {
      return lastLines.join('\n');
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

    return filteredLines.join('\n') || 'No matching logs found';
  }
}
