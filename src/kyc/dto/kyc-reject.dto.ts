import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class KycRejectDto {
  @ApiProperty({
    example: 'Document is unclear, please resubmit with a valid government ID',
  })
  @IsString()
  @MinLength(5)
  reason!: string;
}
