import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LiveStream, StreamDocument } from 'models/LiveStream';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { extname } from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamActivityType, StreamStatus } from 'config/constants';
import { Account } from 'models/Account';
import Redis from 'ioredis';
import { StreamViewer } from 'models/LiveStreamViewer';
import { StreamActivity } from 'models/LiveStreamActivity';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { CdnService } from 'src/cdn/cdn.service';
import { AccountModel } from 'models/Account';
import mongoose from 'mongoose'


@Injectable()
export class LivestreamService {
  constructor(
    @InjectModel(LiveStream.name) private livestreamModel: Model<StreamDocument>,
    @InjectModel(StreamViewer.name) private streamViewerModel: Model<StreamViewer>,
    @InjectModel(StreamActivity.name) private streamActivityModel: Model<StreamActivity>,
    private eventEmitter: EventEmitter2,
    private readonly cdnService: CdnService,
    // @InjectRedis() private readonly redis: Redis,
  ) {}

  async recordActivity(streamId: string, type: StreamActivityType, meta: Record<string, any> = {}) {
    const stream = await this.livestreamModel.findById(streamId);
    if (!stream) throw new NotFoundException('Stream not found');

    return this.streamActivityModel.create({
      streamId,
      status: type,
      meta,
    });
  }

  async createStream(address: string, data: Partial<LiveStream>) {
    const streamKey = this.generateStreamKey();

    const stream = new this.livestreamModel({
      ...data,
      streamKey,
      address,
      status: StreamStatus.SCHEDULED,
      settings: {
        quality: '1080p',
        chat: {
          enabled: true,
          followersOnly: false,
          slowMode: 0,
        },
      },
    });

    await stream.save();
    return stream;
  }

  async startStream(address: string, data?: Partial<LiveStream>, streamId?: string, thumbnail?: Express.Multer.File) {
    let stream = await this.livestreamModel.findById(streamId).exec();

    if (!stream && data) {
      stream = await this.createStream(address, {
        ...data,
      });
    } else if (!stream && streamId) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.address.toString() !== address) {
      throw new BadRequestException('Unauthorized');
    }

    if (stream.status === StreamStatus.LIVE) {
      return stream;
    }

    if (thumbnail) {
      const fileExt = extname(thumbnail.originalname) || '.jpg'; 
      const fileName = `${stream._id}${fileExt}`; 

      const uploadedThumbnail = await this.cdnService.uploadFile(thumbnail.buffer, 'live', `thumbnails/${fileName}`);

      stream.thumbnail = uploadedThumbnail; 
    }

    stream.status = data.status;
    stream.startedAt = new Date();
    await stream.save();

    this.eventEmitter.emit('stream.started', { stream });

    return stream;
  }

  async endStream(streamId: string, address: string) {
    const stream = await this.livestreamModel.findById(streamId).exec();

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.address.toString() !== address) {
      throw new BadRequestException('Unauthorized');
    }

    const endedAt = new Date();
    const duration = Math.floor((endedAt.getTime() - (stream.startedAt?.getTime() || 0)) / 1000);

    stream.status = StreamStatus.ENDED;
    stream.endedAt = endedAt;
    stream.duration = duration;
    await stream.save();

    // Clean up streaming resources
    await this.cleanupStream(streamId);

    return stream;
  }

  async addViewer(streamId: string, address: string) {
    const stream = await this.livestreamModel.findById(streamId);
    if (!stream) throw new NotFoundException('Stream not found');

    const viewer = await this.streamViewerModel.create({
      streamId,
      address,
      joinedAt: new Date(),
    });

    await this.recordActivity(streamId, StreamActivityType.JOINED, { address });

    stream.totalViews += 1;

    const currentViewers = await this.getViewerCount(streamId);
    if (currentViewers > stream.peakViewers) {
      stream.peakViewers = currentViewers;
    }

    await stream.save();

    // Update Redis viewer count
    // await this.redis.incr(`stream:${streamId}:viewers`);

    this.eventEmitter.emit('stream.joined', { viewer });

    return viewer;
  }

  async removeViewer(streamId: string, address: string) {
    const viewer = await this.streamViewerModel.findOne({ streamId, address });

    if (viewer) {
      const leftAt = new Date();
      const duration = Math.floor((leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);

      await this.streamViewerModel.updateOne({ _id: viewer._id }, { leftAt, duration });

      // Update Redis viewer count
      // await this.redis.decr(`stream:${streamId}:viewers`);

      await this.recordActivity(streamId, StreamActivityType.LEFT, { address });

      this.eventEmitter.emit('stream.left', { viewer });
    }
  }

  async addComment(streamId: string, address: string, content: string) {
    const stream = await this.livestreamModel.findById(streamId).exec();

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const comment = {
      content,
      address,
      createdAt: new Date(),
    };

    // Emit real-time event
    this.eventEmitter.emit('stream.comment', { comment });

    return comment;
  }

  async getViewerCount(streamId: string): Promise<number> {
    // const count = await this.redis.get(`stream:${streamId}:viewers`);

    // If Redis has no data, fallback to database
    // if (count === null) {
    const currentViewers = await this.streamActivityModel.countDocuments({
      streamId,
      status: StreamActivityType.JOINED,
      'meta.address': { $exists: true },
    });

    const viewersLeft = await this.streamActivityModel.countDocuments({
      streamId,
      status: StreamActivityType.LEFT,
      'meta.address': { $exists: true },
    });

    const viewers = currentViewers - viewersLeft;

    // Cache the count in Redis for future use
    // await this.redis.set(`stream:${streamId}:viewers`, viewers);

    return viewers;
    // }

    // return parseInt(count, 10);
  }

  private generateStreamKey(): string {
    return crypto.randomBytes(12).toString('hex');
  }

  private async cleanupStream(streamId: string) {
    // Additional cleanup as needeed
  }

  async getAugmentedLiveStreams() {
    const liveStreamsWithAccounts = await this.livestreamModel.aggregate([
      {
        $lookup: {
          from: AccountModel.collection.name, // Name of the Account collection
          localField: 'address', // Field in LiveStream to match
          foreignField: 'address', // Field in Account to match
          as: 'account', // Alias for the joined data
        },
      },
      {
        $addFields: {
          account: {
            $arrayElemAt: ['$account', 0], // Flatten the account array (since $lookup returns an array)
          },
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          thumbnail: 1,
          streamUrl: 1,
          status: 1,
          startedAt: 1,
          endedAt: 1,
          scheduledFor: 1,
          categories: 1,
          address: 1,
          account: {
            username: 1,
            displayName: 1,
            avatarImageUrl: 1,
          },
        },
      },
    ]);
  
    return liveStreamsWithAccounts;
  }

  async getStream(streamId: string) {
    const streamWithAccount = await this.livestreamModel.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(streamId) },
      },
      {
        $lookup: {
          from: 'accounts', 
          localField: 'address', 
          foreignField: 'address', 
          as: 'account',
        },
      },
      {
        $addFields: {
          account: {
            $arrayElemAt: ['$account', 0],
          },
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          thumbnail: 1,
          streamUrl: 1,
          status: 1,
          startedAt: 1,
          endedAt: 1,
          scheduledFor: 1,
          categories: 1,
          address: 1,
          account: {
            username: 1,
            displayName: 1,
            avatarImageUrl: 1,
          },
        },
      },
    ]);
  
    if (!streamWithAccount.length) {
      throw new NotFoundException('Stream not found');
    }
  
    return streamWithAccount[0];
  }

  async getLiveStreams(limit = 20, offset = 0) {
    const liveStreamsWithAccounts = await this.livestreamModel.aggregate([
      {
        $match: { status: { $in: [StreamStatus.LIVE, StreamStatus.SCHEDULED] } }, 
      },
      {
        $sort: { startedAt: -1 }, 
      },
      {
        $skip: offset, 
      },
      {
        $limit: limit, 
      },
      {
        $lookup: {
          from: 'accounts', 
          localField: 'address', 
          foreignField: 'address', 
          as: 'account',
        },
      },
      {
        $addFields: {
          account: {
            $arrayElemAt: ['$account', 0],
          },
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          thumbnail: 1,
          streamUrl: 1,
          status: 1,
          startedAt: 1,
          endedAt: 1,
          scheduledFor: 1,
          categories: 1,
          address: 1,
          account: {
            username: 1,
            displayName: 1,
            avatarImageUrl: 1,
          },
        },
      },
    ]);
  
    return liveStreamsWithAccounts;
  }

  async getUserStreams(address: string, limit = 20, offset = 0) {
    return this.livestreamModel.find({ address }).sort({ createdAt: -1 }).skip(offset).limit(limit).exec();
  }

  async updateStreamSettings(streamId: string, address: string, settings: Partial<LiveStream['settings']>) {
    const stream = await this.livestreamModel.findById(streamId).exec();

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.address.toString() !== address) {
      throw new NotFoundException('Stream not found');
    }

    stream.settings = {
      ...stream.settings,
      ...settings,
    };

    await stream.save();
    return stream;
  }
}
