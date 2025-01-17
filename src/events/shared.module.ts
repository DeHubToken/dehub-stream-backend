import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalEventService } from './event.service';

@Module({
  providers: [GlobalEventService],
  exports: [GlobalEventService],
})
export class SharedModule {}
