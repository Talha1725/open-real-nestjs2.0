import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryListingsDto {
  @ApiPropertyOptional({
    enum: [
      'REAL_ESTATE',
      'INFRASTRUCTURE',
      'PRIVATE_EQUITY',
      'PRIVATE_CREDIT',
      'COMMODITIES',
      'ART_AND_COLLECTIBLES',
      'OTHER',
    ],
  })
  @IsOptional()
  @IsString()
  assetClass?: string;

  @ApiPropertyOptional({
    enum: [
      'NORTH_AMERICA',
      'EUROPE',
      'ASIA_PACIFIC',
      'MIDDLE_EAST',
      'AFRICA',
      'LATIN_AMERICA',
      'GLOBAL',
    ],
  })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ enum: ['LIVE', 'CLOSED'] })
  @IsOptional()
  @IsString()
  @IsIn(['LIVE', 'CLOSED'])
  status?: string;

  @ApiPropertyOptional({ example: 'london office' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'asset-screener' })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ type: String, description: 'Whether to include global market assets (stablecoins, etc)' })
  @IsOptional()
  @IsString()
  includeStablecoins?: string;
}
