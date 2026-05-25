import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectChecklistItemDto {
  @ApiProperty({ example: 'Document illegible' })
  @IsString()
  @MinLength(3)
  reason!: string;
}
