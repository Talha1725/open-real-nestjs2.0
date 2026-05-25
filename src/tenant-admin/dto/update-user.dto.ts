import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsIn,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    enum: [
      'REGISTERED',
      'VERIFIED',
      'ISSUER',
      'ADMIN',
      'SPV_MANAGER',
      'SETTLEMENT_OPS',
      'MARKET_OPS',
      'COMPLIANCE_OFFICER',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    'REGISTERED',
    'VERIFIED',
    'ISSUER',
    'ADMIN',
    'SUPER_ADMIN',
    'SPV_MANAGER',
    'SETTLEMENT_OPS',
    'MARKET_OPS',
    'COMPLIANCE_OFFICER',
  ])
  role?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'])
  status?: string;

  @ApiPropertyOptional({ example: 'John Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({ example: '+44 7700 900000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
