import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Acme Investments Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'app.newdomain.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ example: ['extra.domain.com'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalDomains?: string[];

  @ApiPropertyOptional({ enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] })
  @IsOptional()
  @IsString()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  featureTier?: string;
}
