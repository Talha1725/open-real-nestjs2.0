import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryInvestmentRequestsDto {
  @ApiPropertyOptional({
    enum: [
      'REQUEST_CREATED',
      'PENDING_PAYMENT_CONFIRMATION',
      'CONFIRMED',
      'FAILED',
      'EXPIRED',
    ],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'uuid-of-opportunity' })
  @IsOptional()
  @IsString()
  opportunityId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
