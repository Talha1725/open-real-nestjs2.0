import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOpportunityDto {
  @ApiPropertyOptional({ example: 'Central London Office Complex' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    example: 'Premium Grade A office in the heart of London',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({ example: '<p>This opportunity offers...</p>' })
  @IsOptional()
  @IsString()
  investmentThesis?: string;

  @ApiPropertyOptional({ example: '<p>You are acquiring...</p>' })
  @IsOptional()
  @IsString()
  whatYouAreBuying?: string;

  @ApiPropertyOptional({ example: '<p>Key risks include...</p>' })
  @IsOptional()
  @IsString()
  risks?: string;

  @ApiPropertyOptional({
    example: '<p>Fees: 1.5% annual management fee...</p>',
  })
  @IsOptional()
  @IsString()
  feesAndConflicts?: string;

  @ApiPropertyOptional({
    example: [{ question: 'What is the minimum?', answer: '£10,000' }],
  })
  @IsOptional()
  @IsArray()
  faq?: any[];

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

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumAmount?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumAmount?: number;

  @ApiPropertyOptional({ example: 'GBP' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}
