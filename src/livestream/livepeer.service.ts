import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class LivepeerService {
  private readonly apiKey = process.env.LIVEPEER_API_KEY;
  private readonly apiUrl = 'https://livepeer.studio/api';

  async createStream(name: string): Promise<any> {
    const response = await axios.post(
      `${this.apiUrl}/stream`,
      { name },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );
    return response.data;
  }

  async getStream(livepeerId: string): Promise<any> {
    const response = await axios.get(`${this.apiUrl}/stream/${livepeerId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    return response.data;
  }

  async terminateStream(livepeerId: string): Promise<void> {
    await axios.delete(`${this.apiUrl}/stream/${livepeerId}/terminate`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  async deleteStream(livepeerId: string): Promise<void> {
    await axios.delete(`${this.apiUrl}/stream/${livepeerId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  async getIngestUrl(streamKey: string): Promise<string> {
    return `rtmp://livepeer.studio/live/${streamKey}`;
  }
}