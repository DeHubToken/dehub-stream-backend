import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import mongoose from 'mongoose';
import { LivestreamEvents } from './enums/livestream.enum';
import { ChatGateway } from './chat.gateway';
import { LivepeerService } from './livepeer.service';
import { CategoryModel } from 'models/Category';
import { processCategories, removeDuplicatedElementsFromArray } from 'common/util/validation';

@Injectable()
export class LivestreamService {
  constructor(
    @InjectModel(LiveStream.name) private livestreamModel: Model<StreamDocument>,
    @InjectModel(StreamViewer.name) private streamViewerModel: Model<StreamViewer>,
    @InjectModel(StreamActivity.name) private streamActivityModel: Model<StreamActivity>,
    private eventEmitter: EventEmitter2,
    private readonly cdnService: CdnService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    @InjectRedis() private readonly redis: Redis,
    private livepeerService: LivepeerService,
  ) {}

  async recordActivity(streamId: string, status: StreamActivityType, meta: Record<string, any> = {}) {
    const stream = await this.livestreamModel.findById(streamId);
    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.status !== StreamStatus.LIVE) return;
    if (meta?.address) {
      const account = await AccountModel.findOne({ address: meta?.address });
      meta = {
        ...meta,
        username: account.username,
        displayName: account.displayName,
        avatarImageUrl: account.avatarImageUrl,
      };
    }
    const activity = await this.streamActivityModel.create({
      streamId,
      status,
      address: meta?.address,
      meta,
    });

    await this.livestreamModel.findByIdAndUpdate(streamId, {
      $push: {
        activities: {
          $each: [activity._id],
          $position: 0,
        },
      },
    });

    // const {_id, meta, status, streamId, } = activity;
    return activity.toObject();
  }

  async createStream(address: string, data: Partial<LiveStream>, thumbnail?: Express.Multer.File) {
    try {
      const livepeerResponse = await this.livepeerService.createStream(data.title);
      let categories = data.categories || [];

      if (categories.length > 0) {
        categories = removeDuplicatedElementsFromArray(JSON.parse(categories as unknown as string)) || [];

        const existingCategories = await CategoryModel.find({
          name: { $in: categories },
        }).distinct('name');

        const newCategories = categories.filter(category => !existingCategories.includes(category));

        if (newCategories.length > 0) {
          await CategoryModel.insertMany(newCategories.map(name => ({ name })));
        }
      }

      const stream = new this.livestreamModel({
        title: data.title,
        description: data.description,
        address,
        streamKey: livepeerResponse.streamKey,
        livepeerId: livepeerResponse.id,
        playbackId: livepeerResponse.playbackId,
        status: StreamStatus.OFFLINE,
        isActive: false,
        categories,
        meta: livepeerResponse, // Store full Livepeer response in meta
        settings: {
          quality: '1080p',
          chat: {
            enabled: true,
            followersOnly: false,
            slowMode: 0,
          },
        },
      });

      // Step 3: Handle thumbnail upload
      if (thumbnail) {
        const fileExt = extname(thumbnail.originalname) || '.jpg';
        const fileName = `${stream._id}${fileExt}`;
        const uploadedThumbnail = await this.cdnService.uploadFile(thumbnail.buffer, 'live', `thumbnails/${fileName}`);

        stream.thumbnail = uploadedThumbnail;
      }

      if (data.status === StreamStatus.SCHEDULED) {
        stream.status = StreamStatus.SCHEDULED;
        stream.scheduledFor = data.scheduledFor || new Date();
      }

      await stream.save();
      return stream;
    } catch (error) {
      console.error('Error creating stream:', error);
      throw new Error('Failed to create stream');
    }
  }

  async startStream(address: string, data?: Partial<LiveStream>, streamId?: string, thumbnail?: Express.Multer.File) {
    return true;
  }

  async handleWebhook(data: any) {
    const { event, stream } = data;

    const existingStream = await this.livestreamModel.findOne({
      playbackId: stream.playbackId,
    });

    if (!existingStream) {
      console.error(`Stream not found for playbackId: ${stream.playbackId}`);
      return;
    }

    switch (event) {
      case 'stream.started':
        await this.handleStreamStart(existingStream, stream);
        break;

      case 'stream.idle':
        await this.handleStreamIdle(existingStream, stream);
        break;
    }

    return true;
  }

  private async handleStreamStart(existingStream: StreamDocument, webhookStream: any) {
    const updates = {
      status: StreamStatus.LIVE,
      startedAt: new Date(),
      isActive: true,
    };

    await this.livestreamModel.findByIdAndUpdate(existingStream._id, updates, { new: true });

    this.chatGateway.server.to(`stream:${existingStream._id}`).emit(LivestreamEvents.StartStream, {
      streamId: existingStream._id,
      status: StreamStatus.LIVE,
      startedAt: updates.startedAt,
    });

    await this.recordActivity(existingStream._id as string, StreamActivityType.START, {
      address: existingStream.address,
    });
  }

  private async handleStreamIdle(existingStream: StreamDocument, webhookStream: any) {
    const duration = existingStream.startedAt
      ? Math.floor((Date.now() - existingStream.startedAt.getTime()) / 1000)
      : 0;

    const updates = {
      status: StreamStatus.ENDED,
      endedAt: new Date(),
      isActive: false,
      duration,
    };

    await this.livepeerService.deleteStream(existingStream.livepeerId);

    this.chatGateway.server.to(`stream:${existingStream._id}`).emit(LivestreamEvents.EndStream, {
      streamId: existingStream._id,
      status: StreamStatus.ENDED,
      endedAt: updates.endedAt,
      duration,
    });

    await this.recordActivity(existingStream._id as string, StreamActivityType.END, {
      address: existingStream.address,
    });

    await this.livestreamModel.findByIdAndUpdate(existingStream._id, updates, { new: true });
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

    await this.recordActivity(streamId, StreamActivityType.END, { address });

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

    await this.livestreamModel.findByIdAndUpdate(streamId, {
      $push: {
        viewers: {
          $each: [viewer._id],
          $position: 0,
        },
      },
    });

    await this.recordActivity(streamId, StreamActivityType.JOINED, { address });

    stream.totalViews += 1;

    const currentViewers = await this.getViewerCount(streamId);
    if (currentViewers > stream.peakViewers) {
      stream.peakViewers = currentViewers;
    }

    await stream.save();

    // Update Redis viewer count
    await this.redis.incr(`stream:${streamId}:viewers`);

    return viewer;
  }

  async removeViewer(streamId: string, address: string) {
    const viewer = await this.streamViewerModel.findOne({ streamId, address });

    if (viewer) {
      const leftAt = new Date();
      const duration = Math.floor((leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);

      await this.streamViewerModel.updateOne({ _id: viewer._id }, { leftAt, duration });

      // Update Redis viewer count
      await this.redis.decr(`stream:${streamId}:viewers`);

      await this.recordActivity(streamId, StreamActivityType.LEFT, { address });
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
    // this.eventEmitter.emit('stream.comment', { comment });

    return comment;
  }

  async getViewerCount(streamId: string): Promise<number> {
    const count = await this.redis.get(`stream:${streamId}:viewers`);

    // If Redis has no data, fallback to database
    if (count === null) {
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
      await this.redis.set(`stream:${streamId}:viewers`, viewers);

      return viewers;
    }

    return parseInt(count, 10);
  }

  async likeStream(streamId: string, address: string): Promise<StreamDocument> {
    const stream = await this.livestreamModel.findById(streamId);
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }
    if (stream.status !== StreamStatus.LIVE) {
      throw new NotFoundException('Stream is not live');
    }

    const likeKey = `likesRecord.${address}`;

    const existingLike = await this.livestreamModel.findOne({
      _id: streamId,
      [`likesRecord.${address}`]: { $exists: true },
    });

    if (existingLike) {
      throw new ConflictException('User has already liked this stream');
    }

    const updatedStream = await this.livestreamModel.findByIdAndUpdate(
      streamId,
      {
        $inc: { likes: 1 },
        $set: { [likeKey]: true },
      },
      { new: true },
    );

    if (!updatedStream) {
      throw new NotFoundException('Stream not found during update');
    }

    this.chatGateway.server.to(`stream:${streamId}`).emit(LivestreamEvents.LikeStream, {
      likes: updatedStream.toObject().likes,
    });

    return updatedStream;
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
          livepeerId: 1,
          // streamKey: 1,
          playbackId: 1,
          status: 1,
          startedAt: 1,
          endedAt: 1,
          scheduledFor: 1,
          categories: 1,
          address: 1,
          likes: 1,
          peakViewers: 1,
          totalViews: 1,
          activities: 1,
          viewers: 1,
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

  async getActiveStreamByUser(userAddress: string) {
    return this.livestreamModel
      .findOne({
        address: userAddress,
        status: StreamStatus.LIVE,
      })
      .exec();
  }

  async getStreamsByViewer(userId: string) {
    const viewerEntries = await this.streamViewerModel
      .find({
        address: userId,
        leftAt: { $exists: false }, // Only active viewers (not left the stream)
      })
      .select('streamId')
      .lean()
      .exec();

    const streamIds = viewerEntries.map(entry => entry.streamId);

    return this.livestreamModel
      .find({
        _id: { $in: streamIds },
        status: StreamStatus.LIVE,
      })
      .exec();
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
        $lookup: {
          from: 'streamactivities',
          let: { streamId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$streamId', '$$streamId'] },
              },
            },
            { $sort: { createdAt: 1 } },
            { $limit: 100 },
          ],
          as: 'activities',
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
          livepeerId: 1,
          // streamKey: 1,
          playbackId: 1,
          status: 1,
          startedAt: 1,
          endedAt: 1,
          scheduledFor: 1,
          categories: 1,
          address: 1,
          likes: 1,
          peakViewers: 1,
          totalViews: 1,
          activities: 1,
          viewers: 1,
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

  async getStreamActivities(
    streamId: string,
    options: {
      limit?: number;
      skip?: number;
      type?: StreamActivityType;
      address?: string;
    } = {},
  ) {
    const { limit = 100, skip = 0, type, address } = options;

    const query: any = { streamId };
    if (type) query.status = type;
    if (address) query.address = address;

    // return this.streamActivityModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
    return this.streamActivityModel.find(query).sort({ createdAt: 1 }).skip(skip).exec();
  }

  async getLiveStreams(limit = 20, offset = 0) {
    const liveStreamsWithAccounts = await this.livestreamModel.aggregate([
      {
        $match: { status: { $in: [StreamStatus.LIVE, StreamStatus.SCHEDULED, StreamStatus.OFFLINE] } },
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
          likes: 1,
          peakViewers: 1,
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
