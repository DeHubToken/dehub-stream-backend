import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CdnModule } from 'src/cdn/cdn.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports:[CdnModule],
  exports:[UserService]
})
export class UserModule {}
  