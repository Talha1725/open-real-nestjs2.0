import { IsString, IsUUID, IsNumber, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvestmentRequestDto {
  @ApiProperty({ example: 'uuid-of-opportunity' })
  @IsString()
  @IsUUID()
  opportunityId!: string;

  @ApiProperty({ example: 50000, description: 'Investment amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({
    example: [
      'I understand that this is a request to invest, not a guaranteed allocation.',
      'I have read and understood the risk factors.',
      'I confirm I am eligible to invest in this opportunity.',
    ],
    description: 'Must match all required acknowledgements',
  })
  @IsArray()
  @IsString({ each: true })
  acknowledgements!: string[];
}
