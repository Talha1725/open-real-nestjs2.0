import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkflowsDto {
  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  requestExpiryDays?: number;

  @ApiPropertyOptional({
    example: ['I confirm I have read the prospectus', 'I understand the risks'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredAcknowledgements?: string[];

  @ApiPropertyOptional({ example: ['REAL_ESTATE', 'INFRASTRUCTURE'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAssetClasses?: string[];

  @ApiPropertyOptional({ example: ['EUROPE', 'NORTH_AMERICA'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRegions?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxFileUploadMB?: number;
}
