import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminActionDto {
  @ApiPropertyOptional({ example: 'Payment received via bank transfer' })
  @IsOptional()
  @IsString()
  reason?: string;
}
