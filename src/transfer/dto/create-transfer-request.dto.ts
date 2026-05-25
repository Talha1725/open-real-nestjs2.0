import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TransferInitiationTypeDto {
  KNOWN_BUYER = 'KNOWN_BUYER',
  ISSUER_MANAGED = 'ISSUER_MANAGED',
}

export class CreateTransferRequestDto {
  @ApiProperty({ example: 'holding-uuid' })
  @IsUUID()
  holdingId!: string;

  @ApiProperty({ example: 100.5, description: 'Number of units to transfer' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Proposed price for the transfer',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  proposedPrice?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    enum: TransferInitiationTypeDto,
    default: TransferInitiationTypeDto.ISSUER_MANAGED,
  })
  @IsOptional()
  @IsEnum(TransferInitiationTypeDto)
  initiationType?: TransferInitiationTypeDto;

  @ApiPropertyOptional({
    description: 'Known buyer user id (same tenant as seller)',
  })
  @IsOptional()
  @IsUUID()
  buyerId?: string;
}
