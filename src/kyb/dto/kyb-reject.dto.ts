import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class KybRejectDto {
  @ApiProperty({
    example: 'Registration number could not be verified',
  })
  @IsString()
  @MinLength(5)
  reason!: string;
}
