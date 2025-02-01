import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CdnService } from 'src/cdn/cdn.service';

@Injectable()
export class HlsService {
  private streams: Map<
    string,
    {
      ffmpegProcess: any;
      tempPath: string;
      outputPath: string;
      uploadInterval: NodeJS.Timeout | null;
      isEnding?: boolean;
      pendingChunks?: number;
    }
  > = new Map();

  constructor(private readonly cdnService: CdnService) {}

  private setupStream(streamId: string) {
    if (!this.streams.has(streamId)) {
      const tempPath = path.join(process.cwd(), 'temp', streamId);
      const outputPath = path.join(tempPath, 'hls');

      fs.mkdirSync(outputPath, { recursive: true });

      // '-g', '30', // Force keyframe interval (helps with HLS segmenting)
      // '-re',
      // '-probesize', '500k',
      // '-analyzeduration', '500000',
      // Spawn FFmpeg process for WebM to HLS transcoding
      const ffmpegProcess = spawn('ffmpeg', [
        '-loglevel', 'debug',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-flush_packets', '1',
        '-i',
        'pipe:0', // Read WebM data from stdin
        '-c:v',
        'libx264', // Transcode video to H.264
        '-crf',
        '23', // Quality level (lower is better)
        '-preset',
        'veryfast', // Encoding speed/efficiency
        '-c:a',
        'aac', // Transcode audio to AAC
        '-b:a',
        '128k', // Audio bitrate
        '-f',
        'hls', // Output HLS
        '-hls_time',
        '2', // Segment duration
        '-hls_list_size',
        '6', // Number of segments in playlist
        '-hls_flags',
        // 'split_by_time',
        // 'append_list',
        'delete_segments+append_list',
        '-hls_segment_type',
        'mpegts',
        '-hls_segment_filename',
        `${outputPath}/%d.ts`,
        `${outputPath}/playlist.m3u8`,
      ]);

      ffmpegProcess.stderr.on('data', data => {
        console.error(`[Stream ${streamId}] FFmpeg error:`, data.toString());
      });

      ffmpegProcess.stderr.on('error', error => {
        console.error(`[Stream ${streamId}] FFmpeg error:`, error.toString());
      });

      ffmpegProcess.on('close', code => {
        console.log(`[Stream ${streamId}] FFmpeg process exited with code: ${code}`);
      });

      // Setup periodic upload of HLS segments
      const uploadInterval = setInterval(() => {
        this.uploadNewSegments(streamId);
      }, 2000);

      this.streams.set(streamId, { ffmpegProcess, tempPath, outputPath, uploadInterval, isEnding: false,
        pendingChunks: 0 });
    }

    return this.streams.get(streamId);
  }

  async handleStreamChunk(streamId: string, chunk: Buffer) {
    const streamData = this.setupStream(streamId);

    if (!streamData || streamData.isEnding) {
      console.log(`[Stream ${streamId}] Stream is ending, rejecting new chunks`);
      return;
    }

    if (streamData?.ffmpegProcess?.stdin) {
      console.log("writing chunks before promise", streamData.pendingChunks, chunk.length)
      streamData.pendingChunks++;
      
      return new Promise<void>((resolve, reject) => {
        streamData.ffmpegProcess.stdin.write(chunk, (error) => {
          console.log("writing chunks in promise", streamData.pendingChunks)
          streamData.pendingChunks--;
          if (error) {
          console.log("writing chunks in erre", streamData.pendingChunks, error)
          
          reject(error);
        } else {
            console.log("writing chunks in resolve", streamData.pendingChunks)
            resolve();
          }
        });
      });
    } else {
      console.error(`[Stream ${streamId}] Unable to write chunk to FFmpeg.`);
    }
  }

  private async waitForPendingChunks(streamId: string, timeout = 10000): Promise<void> {
    const streamData = this.streams.get(streamId);
    if (!streamData) return;

    const startTime = Date.now();
    
    while (streamData.pendingChunks > 0) {
      if (Date.now() - startTime > timeout) {
        console.warn(`[Stream ${streamId}] Timeout waiting for pending chunks`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async uploadNewSegments(streamId: string) {
    const streamData = this.streams.get(streamId);
    if (!streamData) return;

    try {
      const files = fs.readdirSync(streamData.outputPath);
      console.log('All files', streamData.outputPath, files);

      const newFiles = files.filter(
        file => (file.endsWith('.ts') || file.endsWith('.m3u8')) && !file.startsWith('uploaded_'),
      );

      console.log('New files',newFiles);
      for (const file of newFiles) {
        const filePath = path.join(streamData.outputPath, file);
        const buffer = fs.readFileSync(filePath);

        await this.cdnService.uploadFile(buffer, 'live', `hls/${streamId}/${file}`, percent =>
          console.log(`[Stream ${streamId}] Uploading ${file}: ${percent}%`),
        );

        // Mark file as uploaded
        fs.renameSync(filePath, path.join(streamData.outputPath, `uploaded_${file}`));
        // just delete man
        // fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[Stream ${streamId}] Error uploading segments:`, error);
    }
  }

  private async convertHlsToMp4(hlsPath: string, outputFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const playlistPath = path.join(hlsPath, 'playlist.m3u8');

      // Spawn FFmpeg process to convert HLS to MP4
      const ffmpegProcess = spawn('ffmpeg', [
        '-i',
        playlistPath, // Input HLS playlist
        '-c',
        'copy', // Copy codec (no re-encoding)
        outputFilePath, // Output MP4 file
      ]);

      ffmpegProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg error:`, data.toString());
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`HLS converted to MP4: ${outputFilePath}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg process exited with code: ${code}`));
        }
      });
    });
  }

  async cleanupStream(streamId: string) {
    console.log(`[Stream ${streamId}] Cleaning up resourcess`);
    const streamData = this.streams.get(streamId);

    if (streamData) {
      try {
      streamData.isEnding = true;

      await this.waitForPendingChunks(streamId);

      // Stop upload interval
      if (streamData.uploadInterval) {
        clearInterval(streamData.uploadInterval);
      }

      await this.uploadNewSegments(streamId);

      // Terminate FFmpeg process
      if (streamData.ffmpegProcess) {
        // streamData.ffmpegProcess.stdin.end();
        // streamData.ffmpegProcess.kill();
        await new Promise<void>((resolve) => {
          streamData.ffmpegProcess.stdin.end(() => {
            streamData.ffmpegProcess.on('close', () => {
              resolve();
            });
          });
        });
      }

      const outputFilePath = path.join(streamData.tempPath, 'output.mp4');
      await this.convertHlsToMp4(streamData.outputPath, outputFilePath);

      const buffer = fs.readFileSync(outputFilePath);
      await this.cdnService.uploadFile(buffer, 'live', `mp4/${streamId}.mp4`, (percent) =>
        console.log(`[Stream ${streamId}] Uploading MP4: ${percent}%`),
      );

      // Remove temporary files
      fs.rmSync(streamData.tempPath, { recursive: true, force: true });
      this.streams.delete(streamId);
    } catch (error) {
      console.error(`[Stream ${streamId}] Error during cleanup:`, error);
      throw error;
    }
    }
  }
}
