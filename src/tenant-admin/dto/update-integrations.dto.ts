import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PaymentConfigDto {
  @ApiProperty({ example: 'Tenant Client Account' })
  @IsString()
  @MinLength(1)
  accountName!: string;

  @ApiProperty({ example: 'GB29NWBK60161331926819' })
  @IsString()
  @MinLength(1)
  iban!: string;

  @ApiProperty({ example: 'National Westminster Bank' })
  @IsString()
  @MinLength(1)
  bankName!: string;

  @ApiProperty({ example: 'NWBKGB2L' })
  @IsString()
  @MinLength(1)
  swift!: string;
}

export class UpdateIntegrationsDto {
  @ApiPropertyOptional({ example: 'sumsub' })
  @IsOptional()
  @IsString()
  kycProvider?: string;

  @ApiPropertyOptional({ description: 'Payment receiving account config' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentConfigDto)
  paymentConfig?: PaymentConfigDto;

  @ApiPropertyOptional({ description: 'Any additional integration overrides' })
  @IsOptional()
  @IsObject()
  overrides?: Record<string, any>;
}
