import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateTransferCaseMetaDto {
  @ApiPropertyOptional({ description: 'ISO date or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.dueAt != null)
  @IsDateString()
  dueAt?: string | null;

  @ApiPropertyOptional({
    description: 'Internal assignee (user id) or null to clear',
  })
  @IsOptional()
  @ValidateIf((o) => o.assignedToUserId != null)
  @IsUUID()
  assignedToUserId?: string | null;
}
