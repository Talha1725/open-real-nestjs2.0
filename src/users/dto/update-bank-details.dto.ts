import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class UpdateBankDetailsDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  accountHolderName: string;

  @ApiPropertyOptional({ example: 'GB29NWBK60161331926819' })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ example: '31926819' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ example: 'National Westminster Bank' })
  @IsString()
  bankName: string;

  @ApiPropertyOptional({ example: 'NWBKGB2L' })
  @IsOptional()
  @IsString()
  swiftBic?: string;

  @ApiPropertyOptional({ example: '601613' })
  @IsOptional()
  @IsString()
  sortCode?: string;

  @ApiPropertyOptional({
    example: 'GBP',
    description: 'ISO 4217 currency code',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
