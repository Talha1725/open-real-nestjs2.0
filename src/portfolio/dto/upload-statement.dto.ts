import { IsString, IsIn, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadStatementDto {
  @ApiProperty({
    enum: ['PERIODIC', 'TAX', 'CONFIRMATION'],
    example: 'PERIODIC',
  })
  @IsString()
  @IsIn(['PERIODIC', 'TAX', 'CONFIRMATION'])
  type!: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsString()
  @IsDateString()
  periodEnd?: string;
}
