import {
  IsString,
  IsNumber,
  IsIn,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDistributionDto {
  @ApiProperty({
    enum: ['DIVIDEND', 'INTEREST', 'RETURN_OF_CAPITAL', 'OTHER'],
    example: 'DIVIDEND',
  })
  @IsString()
  @IsIn(['DIVIDEND', 'INTEREST', 'RETURN_OF_CAPITAL', 'OTHER'])
  type!: string;

  @ApiProperty({ example: 2500.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: 'GBP' })
  @IsString()
  currency!: string;

  @ApiProperty({
    example: '2026-03-01',
    description: 'Distribution date (YYYY-MM-DD)',
  })
  @IsString()
  @IsDateString()
  distributionDate!: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'PAID'], default: 'PENDING' })
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PAID'])
  status?: string;
}
