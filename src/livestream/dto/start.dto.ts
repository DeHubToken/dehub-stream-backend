import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StreamStatus } from 'config/constants';

class StreamSettingsDto {
  @IsOptional()
  @IsBoolean({ message: 'Enable chat must be a boolean value.' })
  enableChat: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Schedule must be a boolean value.' })
  schedule: boolean;
}

export class StartLiveStreamDto {
  @IsString({ message: 'Title is required and must be a string.' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string if provided.' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Stream ID must be a string if provided.' })
  streamId?: string;

  // @IsString({ message: 'Thumbnail is required and must be a valid string.' })
  // thumbnail: string;

  @IsEnum(StreamStatus, { message: `Status must be one of the following: ${Object.values(StreamStatus).join(', ')}.` })
  status: StreamStatus;

  @IsArray({ message: 'Categories must be an array of strings.' })
  @IsString({ each: true, message: 'Each category must be a string.' })
  categories: string[];

  @IsOptional()
  @ValidateNested({ message: 'Settings must be a valid object.' })
  @Type(() => StreamSettingsDto)
  settings?: StreamSettingsDto;

  @IsOptional()
  @IsDateString({}, { message: 'Scheduled For must be a valid ISO 8601 date string if provided.' })
  scheduledFor?: Date;

  // @IsOptional()
  // files?: any
}
