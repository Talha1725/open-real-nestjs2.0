import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportAuditLogsDto {
  @ApiProperty({
    enum: ['csv', 'pdf'],
    description: 'Export format',
  })
  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';

  @ApiProperty({
    description: 'Double-action confirmation — must be true',
  })
  @IsBoolean()
  confirmExport!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}
