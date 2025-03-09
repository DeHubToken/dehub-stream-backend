import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  InternalServerErrorException,
} from '@nestjs/common';
import { LivestreamService } from './livestream.service';
import { AuthGuard } from 'common/guards/auth.guard';
import { StartLiveStreamDto } from './dto/start.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { HlsService } from './hls.service';

@Controller('live')
export class LivestreamController {
  constructor(
    private readonly livestreamService: LivestreamService,
    private readonly hlsService: HlsService,
  ) {}

  @Get()
  getLiveStreams() {
    return this.livestreamService.getLiveStreams();
  }

  @UseGuards(AuthGuard)
  @Post()
  async createStream(@Req() req, @Body() liveStreamDto: any, @UploadedFiles() files: Express.Multer.File[]) {
    const address = req.params.address;
    const { streamId, ...data } = liveStreamDto;
    const thumbnail = files.find(file => file.fieldname === 'thumbnail') || null;
    return this.livestreamService.createStream(address, data, thumbnail);
  }

  @UseGuards(AuthGuard)
  @Post('start')
  async startStream(@Body('streamId') streamId: string) {
    return this.livestreamService.startStream(streamId);
  }

  // @UseGuards(AuthGuard)
  // @Post('end')
  // async endStream(@Body('streamId') streamId: string) {
  //   return this.livestreamService.endStream(streamId);
  // }

  // @Get(':streamId/playback-url')
  // async getPlaybackUrl(@Param('streamId') streamId: string) {
  //   return this.livestreamService.getStreamPlaybackUrl(streamId);
  // }

  @Get('user/:address')
  getMyLiveStreams(@Param('address') address: string) {
    return this.livestreamService.getUserStreams(address);
  }

  @Get(':streamId')
  getStreamDetails(@Param('streamId') streamId: string) {
    return this.livestreamService.getStream(streamId);
  }

  @Get(':streamId/activities')
  getStreamAtivities(@Param('streamId') streamId: string) {
    return this.livestreamService.getStreamActivities(streamId);
  }

  @UseGuards(AuthGuard)
  @Post(':streamId/like')
  likeStream(@Req() req, @Param('streamId') streamId: string) {
    const address = req.params.address;
    return this.livestreamService.likeStream(streamId, address);
  }

  @UseGuards(AuthGuard)
  @Post(':streamId/gift')
  async giftStream(
    @Req() req,
    @Param('streamId') streamId: string,
    @Body()
    giftData: {
      transactionHash: string;
      tokenId: string;
      amount: number;
      recipient: string;
      tokenAddress: string;
      message?: string;
      selectedTier?: string;
      timestamp: number;
    },
  ) {
    const address = req.params.address;
    return this.livestreamService.handleGift(streamId, address, giftData);
  }

  @Post('webhook')
  handleWebhook(@Body() data: any) {
    return this.livestreamService.handleWebhook(data);
  }
}
