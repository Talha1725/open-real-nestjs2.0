import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'Google Identity Services ID token credential',
  })
  @IsString()
  @MinLength(1)
  credential: string;
}
