import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class IssuerRejectTransferDto {
  @ApiProperty({ example: 'Does not meet transfer policy' })
  @IsString()
  @MinLength(5)
  reason!: string;
}
