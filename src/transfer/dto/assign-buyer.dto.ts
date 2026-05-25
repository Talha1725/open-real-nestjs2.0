import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignBuyerDto {
  @ApiProperty({ example: 'buyer-user-uuid' })
  @IsUUID()
  buyerId!: string;
}
