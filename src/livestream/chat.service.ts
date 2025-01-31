import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LiveStream } from 'models/LiveStream';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamActivityType, StreamStatus } from 'config/constants';
import { LivestreamService } from './livestream.service';

@Injectable()
export class StreamChatService {
  constructor(@Inject(forwardRef(() => LivestreamService)) private livestreamService: LivestreamService) {}

  async addChatMessage(streamId: string, address: string, content: string, meta?: any) {
    return this.livestreamService.recordActivity(streamId, StreamActivityType.MESSAGE, {
      ...meta,
      address,
      content,
    });
  }

  async likeStream(streamId: string, address: string, meta?: any) {
    return this.livestreamService.recordActivity(streamId, StreamActivityType.LIKE, {
      address,
      ...meta
    });
  }

  //   async addReaction(streamId: string, address: string, reactionType: string) {
  //     return this.livestreamService.recordActivity(streamId, StreamActivityType.REACTION, {
  //       address,
  //       reactionType,
  //     });
  //   }
}
