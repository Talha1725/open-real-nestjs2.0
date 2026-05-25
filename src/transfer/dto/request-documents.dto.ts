import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferChecklistItemInputDto {
  @ApiProperty({ example: 'proof_of_funds' })
  @IsString()
  @MinLength(1)
  itemKey!: string;

  @ApiProperty({ example: 'Proof of funds' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class RequestDocumentsDto {
  @ApiProperty({ type: [TransferChecklistItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferChecklistItemInputDto)
  items!: TransferChecklistItemInputDto[];
}
