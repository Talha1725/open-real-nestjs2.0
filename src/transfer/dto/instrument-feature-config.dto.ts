import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class InstrumentFeatureConfigDto {
  @ApiPropertyOptional({
    description: 'Enable primary issuance',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  primaryIssueEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable transfer requests',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  transferRequestEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable secondary market trading',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  secondaryMarketEnabled?: boolean;

  @ApiPropertyOptional({
    enum: ['none', 'transfer_only', 'rfq_matching', 'order_book'],
    default: 'none',
  })
  @IsOptional()
  @IsString()
  @IsIn(['none', 'transfer_only', 'rfq_matching', 'order_book'])
  liquidityMode?: string;

  @ApiPropertyOptional({
    enum: ['none', 'shadow_mirror', 'live_transferable'],
    default: 'none',
  })
  @IsOptional()
  @IsString()
  @IsIn(['none', 'shadow_mirror', 'live_transferable'])
  tokenState?: string;

  @ApiPropertyOptional({
    enum: ['manual_external_confirm', 'automated_dvp'],
    default: 'manual_external_confirm',
  })
  @IsOptional()
  @IsString()
  @IsIn(['manual_external_confirm', 'automated_dvp'])
  settlementMode?: string;

  @ApiPropertyOptional({
    description: 'Whether surveillance is required',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  surveillanceRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Investor category ruleset identifier',
    example: 'adgm_retail_exempt',
  })
  @IsOptional()
  @IsString()
  investorCategoryRuleset?: string;
}
