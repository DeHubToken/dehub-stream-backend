import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class GlobalEventService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  // Method to emit an event
  emit(event: string, payload: any) {
    this.eventEmitter.emit(event, payload);
  }
}
