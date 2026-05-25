import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateFeaturesDto {
  @ApiProperty({
    example: {
      market_overview: true,
      issuer_portal: false,
      advanced_analytics: true,
    },
  })
  @IsObject()
  features: Record<string, boolean>;
}
