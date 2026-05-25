import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKybDto {
  @ApiProperty({ example: 'Acme Capital Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  organizationName!: string;

  @ApiProperty({ example: 'RC-12345678' })
  @IsString()
  registrationNumber!: string;

  @ApiProperty({ example: 'United Kingdom' })
  @IsString()
  countryOfIncorporation!: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @MinLength(2)
  representativeName!: string;

  @ApiProperty({ example: 'john@acmecapital.com' })
  @IsEmail()
  representativeEmail!: string;

  @ApiPropertyOptional({
    example: ['file-key-1', 'file-key-2'],
    description: 'S3 file keys from prior document uploads',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentKeys?: string[];
}
