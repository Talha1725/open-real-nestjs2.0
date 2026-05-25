import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLegalDto {
  @ApiPropertyOptional({ example: '<h1>Terms of Service</h1><p>...</p>' })
  @IsOptional()
  @IsString()
  termsContent?: string;

  @ApiPropertyOptional({ example: 'https://example.com/terms' })
  @IsOptional()
  @IsString()
  termsUrl?: string;

  @ApiPropertyOptional({ example: '<h1>Privacy Policy</h1><p>...</p>' })
  @IsOptional()
  @IsString()
  privacyContent?: string;

  @ApiPropertyOptional({ example: 'https://example.com/privacy' })
  @IsOptional()
  @IsString()
  privacyUrl?: string;

  @ApiPropertyOptional({ example: 'Important regulatory notice...' })
  @IsOptional()
  @IsString()
  regulatoryNotice?: string;

  @ApiPropertyOptional({ example: '123 Business St, London' })
  @IsOptional()
  @IsString()
  companyAddress?: string;

  @ApiPropertyOptional({ example: 'OpenReal Ltd' })
  @IsOptional()
  @IsString()
  copyrightHolder?: string;
}
