import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MfaLoginDto {
  @ApiPropertyOptional({ description: 'Temporary MFA token from login response' })
  @IsOptional()
  @IsString()
  mfaToken?: string;

  @ApiPropertyOptional({
    description: '6-digit TOTP code from authenticator app',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'One-time MFA recovery code (e.g. A1B2C3-D4E5F6)',
  })
  @IsOptional()
  @IsString()
  recoveryCode?: string;
}
