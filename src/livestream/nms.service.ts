// depreciated
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import NodeMediaServer from 'node-media-server';
import { CdnService } from 'src/cdn/cdn.service';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

@Injectable()
export class NmsStreamingService implements OnModuleInit, OnModuleDestroy {
  private nms: NodeMediaServer;
  private activeStreams: Map<string, { path: string }> = new Map();

  constructor(private readonly cdnService: CdnService) {
    this.nms = new NodeMediaServer({
      rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
      },
      http: {
        port: 8000,
        allow_origin: '*',
        mediaroot: './media',
      },
      trans: {
        ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
        tasks: [
          {
            app: 'live',
            hls: true,
            hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
            dash: true,
            dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
          }
        ]
      }
    });

    this.nms.on('postPublish', async (id, StreamPath, args) => {
      console.log('[Stream Started]', StreamPath);
      this.activeStreams.set(id, { path: StreamPath });
      this.startSegmentUpload(id, StreamPath);
    });

    this.nms.on('donePublish', async (id, StreamPath, args) => {
      console.log('[Stream Ended]', StreamPath);
      this.activeStreams.delete(id);
    });
  }

  onModuleInit() {
    this.nms.run();
    console.log('Media Server Started');
  }

  onModuleDestroy() {
    this.nms.stop();
  }

  private async startSegmentUpload(streamId: string, streamPath: string) {
    const hlsDir = path.join('./media', streamPath, 'hls');
    
    const checkInterval = setInterval(async () => {
      if (!this.activeStreams.has(streamId)) {
        clearInterval(checkInterval);
        return;
      }

      try {
        const files = fs.readdirSync(hlsDir);
        for (const file of files) {
          if (file.endsWith('.m3u8') || file.endsWith('.ts')) {
            const filePath = path.join(hlsDir, file);
            const stats = fs.statSync(filePath);
            if (Date.now() - stats.mtimeMs > 1000) {
              const buffer = fs.readFileSync(filePath);
              await this.cdnService.uploadFile(buffer, 'live', `hls/${streamId}/${file}`);
              if (file.endsWith('.ts')) fs.unlinkSync(filePath);
            }
          }
        }
      } catch (error) {
        console.error('Error uploading segments:', error);
      }
    }, 1000);
  }

  async handleStreamChunk(streamId: string, chunk: Buffer) {
    const rtmpUrl = `rtmp://localhost:1935/live/${streamId}`;
    try {
      await this.pushToRtmp(rtmpUrl, chunk);
    } catch (error) {
      console.error('Error pushing to RTMP:', error);
    }
  }

  private async pushToRtmp(rtmpUrl: string, chunk: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-f', 'flv',
        rtmpUrl
      ]);

      ffmpeg.stdin.write(chunk);
      
      ffmpeg.stderr.on('data', (data) => {
        console.log('FFmpeg Log:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  getStreamUrl(streamId: string): string {
    return `${process.env.CDN_BASE_URL}/hls/${streamId}/index.m3u8`;
  }
}
