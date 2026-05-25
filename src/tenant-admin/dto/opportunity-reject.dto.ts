import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpportunityRejectDto {
  @ApiProperty({
    example:
      'Risk disclosures are insufficient. Please add more detail on market risk.',
  })
  @IsString()
  @MinLength(5)
  feedback!: string;
}
