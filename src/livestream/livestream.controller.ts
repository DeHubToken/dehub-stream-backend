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
  async createStream(
    @Req() req,
    @Body() liveStreamDto: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const address = req.params.address;
    const { streamId, ...data } = liveStreamDto;
    const thumbnail = files.find(file => file.fieldname === 'thumbnail') || null;
    return this.livestreamService.startStream(address, data, streamId, thumbnail);
  }

  @Get('user/:address')
  getMyLiveStreams(@Param('address') address: string) {
    return this.livestreamService.getUserStreams(address);
  }

  @Get(':streamId')
  getStreamDetails(@Param('streamId') streamId: string) {
    return this.livestreamService.getStream(streamId);
  }

  // @UseGuards(AuthGuard)
  // @Post(':streamId')
  // @UseInterceptors(FileInterceptor('file'))
  // async startLiveStream(@Req() req, @UploadedFile() file: Express.Multer.File, @Param('streamId') streamId: string) {
  //   const address = req.params.address;
  //   const slug = `hls/${address}/${streamId}`
  //   const filePath = path.join('uploads', streamId + '.mp4');

  //   fs.writeFileSync(filePath, file.buffer);

  //   // const playbackUrl = await this.hlsService.processStream(filePath, slug);
  //   const playbackUrl = 'await this.hlsService.processStream(filePath, slug)';

  //   fs.unlinkSync(filePath);

  //   console.log(playbackUrl)

  //   return { playbackUrl };
  // }

  @UseGuards(AuthGuard)
  @Patch()
  async updateStream(@Body('streamId') streamId: string) {}

  @UseGuards(AuthGuard)
  @Post('end')
  async endStream() {}
}
