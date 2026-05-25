import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class ResolveEscalationDto {
  @ApiProperty({
    enum: ['MANAGER_REVIEW', 'COMPLIANCE_REVIEW', 'DOCS_PENDING'],
    example: 'MANAGER_REVIEW',
  })
  @IsIn(['MANAGER_REVIEW', 'COMPLIANCE_REVIEW', 'DOCS_PENDING'])
  targetStatus!: 'MANAGER_REVIEW' | 'COMPLIANCE_REVIEW' | 'DOCS_PENDING';

  @ApiProperty({
    example: 'Resolved after manual review. Continuing workflow.',
  })
  @IsString()
  @MinLength(5)
  notes!: string;
}
