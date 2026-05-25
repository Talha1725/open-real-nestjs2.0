import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength } from 'class-validator';

export class ConfirmPaymentDto {
  @ApiProperty({ example: 'PAY-REF-123456' })
  @IsString()
  @MinLength(1)
  paymentReference!: string;

  @ApiPropertyOptional({ example: 'Payment received via wire transfer' })
  @IsOptional()
  @IsString()
  notes?: string;
}
