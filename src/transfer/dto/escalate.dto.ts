import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class EscalateDto {
  @ApiProperty({ example: 'Compliance review required' })
  @IsString()
  @MinLength(5)
  reason!: string;
}
