import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import flash from 'connect-flash';
import cors from 'cors';
import methodOverride from 'method-override';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from 'common/filters/allexceptions';
import { SocketIoAdapter } from 'common/adapters/socket-io.adapters';
import  {config}  from 'config';
import * as socketIO from 'socket.io';
import { createServer } from 'http';
import { addUserToOnlineList, getOnlineUsers, removeUserFromOnlineList } from 'common/util/socket';
import { json } from 'express';
import * as bodyParser from 'body-parser';
// import { DMSocketController } from './dm/dm.socket.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });



   // 👇 Stripe webhook raw body setup (⚠️ only for Stripe!)
   app.use('/api/dpay/webhook', bodyParser.raw({ type: 'application/json' }));
 
  app.use(cookieParser());
  app.use(cors());
  app.use(json()); // Ensure JSON body parsing is set up
  app.use(
    session({
      secret: '1234567890',
      resave: true,
      saveUninitialized: true,
      cookie: { secure: false },
    }),
  );
  app.use(flash());
  app.use(methodOverride('X-HTTP-Method-Override'));
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('api');

  // Set global error filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Connect to MongoDB
  const mongoUri = `mongodb://${config.mongo.host}:${config.mongo.port}/${config.mongo.dbName}`;
;
  await mongoose.connect(mongoUri); // Await connection

  mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
  });

  // Use the Socket.IO adapter for WebSocket connections
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  app.set('view engine', 'ejs');

  await app.listen(process.env.API_PORT);

  console.log(`Application is running on port :${process.env.API_PORT}`);
}

bootstrap();
