import { Injectable } from '@nestjs/common';
import { Mux } from '@mux/mux-node';

@Injectable()
export class MuxService {
  private mux: Mux;

  constructor() {
    this.mux = new Mux({
      tokenId: process.env.MUX_ACCESS_TOKEN, 
      tokenSecret: process.env.MUX_SECRET_KEY,
    });
  }

  async createLiveStream(streamId: string) {
    const liveStream = await this.mux.video.liveStreams.create({
      playback_policy: ['public'],
      new_asset_settings: {
        playback_policy: ['public'],
      },
    });

    return liveStream;
  }

  async getLiveStream(streamId: string) {
    const liveStream = await this.mux.video.liveStreams.retrieve(streamId);
    return liveStream;
  }

  async deleteLiveStream(streamId: string) {
    await this.mux.video.liveStreams.delete(streamId);
  }
}