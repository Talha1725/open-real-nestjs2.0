import { IsOptional, IsString, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBrandingDto {
  @ApiPropertyOptional({ example: '#0D0F14' })
  @IsOptional()
  @IsString()
  bgPrimary?: string;

  @ApiPropertyOptional({ example: '#141720' })
  @IsOptional()
  @IsString()
  bgSecondary?: string;

  @ApiPropertyOptional({ example: '#1A1E2B' })
  @IsOptional()
  @IsString()
  bgTertiary?: string;

  @ApiPropertyOptional({ example: '#4F7BF7' })
  @IsOptional()
  @IsString()
  accent?: string;

  @ApiPropertyOptional({ example: '#FFFFFF' })
  @IsOptional()
  @IsString()
  textPrimary?: string;

  @ApiPropertyOptional({ example: '#8B92A5' })
  @IsOptional()
  @IsString()
  textSecondary?: string;

  @ApiPropertyOptional({ example: '#2A2E3D' })
  @IsOptional()
  @IsString()
  border?: string;

  @ApiPropertyOptional({ example: '#22C55E' })
  @IsOptional()
  @IsString()
  success?: string;

  @ApiPropertyOptional({ example: '#F59E0B' })
  @IsOptional()
  @IsString()
  warning?: string;

  @ApiPropertyOptional({ example: '#EF4444' })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ example: 'Inter, sans-serif' })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ example: 'Inter, sans-serif' })
  @IsOptional()
  @IsString()
  headingFont?: string;

  @ApiPropertyOptional({ description: 'Any additional branding overrides' })
  @IsOptional()
  @IsObject()
  overrides?: Record<string, any>;
}
