import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  token: string;
}
