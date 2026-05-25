import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class MfaActionDto {
  @ApiProperty({
    enum: ['setup', 'enable', 'disable'],
    description:
      'setup: get QR code, enable: verify code + activate, disable: verify code + deactivate',
  })
  @IsIn(['setup', 'enable', 'disable'])
  action!: 'setup' | 'enable' | 'disable';

  @ApiProperty({
    required: false,
    description: 'Secret from setup step (required for enable)',
  })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiProperty({
    required: false,
    description: '6-digit TOTP code (required for enable/disable)',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
