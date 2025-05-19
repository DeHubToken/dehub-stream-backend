import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateImageDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  style?: string;
}
