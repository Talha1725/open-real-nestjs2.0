import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsIn,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTransfersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @ApiPropertyOptional({
    description: 'ISO date — dueAt <= this (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @ApiPropertyOptional({
    description: 'ISO date — dueAt >= this (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional({
    description: 'Filter by ROFR window + notice state (issuer queue)',
    enum: ['OPEN', 'CLOSED', 'NONE'],
  })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED', 'NONE'])
  priorityState?: 'OPEN' | 'CLOSED' | 'NONE';

  @ApiPropertyOptional({
    description: 'Derived from buyer KYC (latest verification)',
    enum: ['VERIFIED', 'PENDING', 'NONE'],
  })
  @IsOptional()
  @IsIn(['VERIFIED', 'PENDING', 'NONE'])
  buyerVerificationState?: 'VERIFIED' | 'PENDING' | 'NONE';

  @ApiPropertyOptional({
    description: 'Case reference substring (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  referenceContains?: string;

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
