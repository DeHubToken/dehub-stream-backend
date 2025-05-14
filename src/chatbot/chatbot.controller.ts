import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './send-message.dto';
import { AuthGuard } from 'common/guards/auth.guard';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

} 