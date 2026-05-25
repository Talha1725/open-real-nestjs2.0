import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class IssuerCancelTransferDto {
  @ApiPropertyOptional({
    example: 'Issuer cancelled due to compliance concerns',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
