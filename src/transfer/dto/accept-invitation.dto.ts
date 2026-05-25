import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiPropertyOptional({
    description:
      'Token from invite response (optional if logged-in email matches invitation)',
  })
  @IsOptional()
  @IsString()
  @MinLength(16)
  token?: string;
}
