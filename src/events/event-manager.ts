import { EventEmitter2 } from '@nestjs/event-emitter';

export class EventManager {
  private static eventEmitter: EventEmitter2;

  static getInstance(): EventEmitter2 {
    if (!this.eventEmitter) {
      this.eventEmitter = new EventEmitter2();
    }
    return this.eventEmitter;
  }
}

export const EventEmitter = {
  tipSend: 'tipSend',
};
