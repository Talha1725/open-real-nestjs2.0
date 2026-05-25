import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message:
      'Password must contain at least 1 uppercase letter, 1 number, and 1 special character',
  })
  password: string;

  @ApiProperty({
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
    example: 'REGISTERED',
  })
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
  role: string;

  @ApiPropertyOptional({ example: '+44 7700 900000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}
