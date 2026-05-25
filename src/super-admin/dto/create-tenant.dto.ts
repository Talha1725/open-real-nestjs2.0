import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Investments' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'acme-investments' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens only',
  })
  slug: string;

  @ApiProperty({ example: 'app.acmeinvestments.com' })
  @IsString()
  domain: string;

  @ApiPropertyOptional({ example: ['acme.platform.com'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalDomains?: string[];

  @ApiProperty({ example: 'admin@acmeinvestments.com' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @MinLength(2)
  adminName: string;

  @ApiProperty({ example: 'AdminPass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 number, and 1 special character',
  })
  adminPassword: string;

  @ApiProperty({
    enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'],
    example: 'PROFESSIONAL',
  })
  @IsString()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  featureTier: string;
}
