import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const OUTCOME_CATEGORIES = ['success', 'error', 'warning', 'info'] as const;
export type AuditOutcomeCategory = (typeof OUTCOME_CATEGORIES)[number];

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'USER_LOGIN' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ example: 'User' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'login' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: OUTCOME_CATEGORIES, example: 'success' })
  @IsOptional()
  @IsString()
  @IsIn(OUTCOME_CATEGORIES)
  category?: AuditOutcomeCategory;

  @ApiPropertyOptional({
    description: 'Alias for category for backward/alternate clients',
    enum: OUTCOME_CATEGORIES,
    example: 'error',
  })
  @IsOptional()
  @IsString()
  @IsIn(OUTCOME_CATEGORIES)
  outcome?: AuditOutcomeCategory;
}
