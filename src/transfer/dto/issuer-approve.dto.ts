import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class IssuerApproveDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Whether to trigger ROFR priority window for co-holders',
  })
  @IsOptional()
  @IsBoolean()
  rofrEnabled?: boolean;
}
