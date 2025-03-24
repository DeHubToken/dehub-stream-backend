import { Injectable, BadRequestException } from '@nestjs/common';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import { Upload } from '@aws-sdk/lib-storage';
import { promises as fs } from 'fs';
import { join } from 'path';
import { generateSlug } from 'common/util/slugify';
import * as Fs from 'fs';
import * as path from 'path';

@Injectable()
export class CdnService {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      endpoint: process.env.DO_S3_ENDPOINT,
      region: process.env.DO_S3_REGION,
      credentials: {
        accessKeyId: process.env.DO_S3_ACCESS_KEY,
        secretAccessKey: process.env.DO_S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadFile(buffer: Buffer, slug: string, filename: string, onProgress?: (percent: number) => void): Promise<string> {
    const key = `${generateSlug(slug)}/${filename}`;
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.DO_S3_SPACENAME,
        Key: key,
        Body: body,
        ACL: 'public-read',
      },
    })

    upload.on('httpUploadProgress', (progress) => {
      if (progress.total && onProgress) {
        const percent = Math.floor((progress.loaded / progress.total) * 100);
        console.log(percent)
        onProgress(percent);
      }
    });

    await upload.done();

    return `${key}`;
  }

  async getFileDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(url, (err:any, metadata:any) => {
        if (err) return reject(err);
        resolve(metadata.format.duration);
      });
    });
  }

  async validateFileDuration(url: string): Promise<number> {
    console.log(url);
    const duration = await this.getFileDuration(url);
    console.log(duration);
    
    if (duration > 30) {
      throw new BadRequestException('File exceeds 30 seconds');
    }
    return duration
  }

  async generateThumbnail(videoUrl: string, folder: string, slug: string): Promise<string> {
    const thumbnailFilename = `${slug}-thumbnail.png`;
    const thumbnailPath = join(folder, thumbnailFilename);

    return new Promise((resolve, reject) => {
      ffmpeg(videoUrl)
        .on('end', async () => {
          try {
            const thumbnailBuffer = await fs.readFile(thumbnailPath);
            const thumbnailUrl = await this.uploadFile(thumbnailBuffer, folder, thumbnailFilename);
            await fs.unlink(thumbnailPath); // Clean up the temporary thumbnail file
            resolve(thumbnailUrl);
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          reject(err);
        })
        .screenshots({
          count: 1,
          folder,
          filename: thumbnailFilename,
          size: '320x240',
        });
    });
  }

  async deleteFile(key: string): Promise<void> {
    const parsedUrl = new URL(key);
      const keyg = decodeURIComponent(parsedUrl.pathname.substring(1));
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.DO_S3_SPACENAME,
        Key: keyg,
      }));
    } catch (error: any & { message: string }) {
      throw new Error(`Failed to delete file from DigitalOcean: ${error.message}`);
    }
  }

  async uploadHLSFolder(localFolderPath: string, slug: string): Promise<void> {
    const files = Fs.readdirSync(localFolderPath);
  
    for (const file of files) {
      const filePath = path.join(localFolderPath, file);
      const fileBuffer = Fs.readFileSync(filePath);
  
      await this.uploadFile(fileBuffer, slug, file);
    }
  }

  async cleanupLocalFiles(folderPath: string) {
    Fs.rmSync(folderPath, { recursive: true, force: true });
  }
}