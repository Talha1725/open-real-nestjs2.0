import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { TenantAdminService } from './tenant-admin.service.js';
import { QueryOpportunityReviewDto } from './dto/query-opportunity-review.dto.js';
import { OpportunityRejectDto } from './dto/opportunity-reject.dto.js';
import { InstrumentFeatureConfigDto } from '../transfer/dto/instrument-feature-config.dto.js';

@ApiTags('Tenant Admin - Opportunities')
@ApiBearerAuth('access-token')
@Controller('admin/opportunities')
@Roles('ADMIN')
export class AdminOpportunitiesController {
  constructor(private readonly service: TenantAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Opportunity review queue' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated opportunity list' })
  listOpportunities(@Query() query: QueryOpportunityReviewDto) {
    return this.service.listOpportunitiesForReview(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get opportunity for review with full content and documents',
  })
  @ApiResponse({
    status: 200,
    description: 'Full opportunity detail for review',
  })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getOpportunity(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOpportunityForReview(id);
  }

  @Post(':id/approve')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Approve opportunity — sets status to LIVE' })
  @ApiResponse({ status: 200, description: 'Opportunity approved' })
  @ApiResponse({ status: 400, description: 'Invalid status for approval' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.approveOpportunity(id, user.sub);
  }

  @Post(':id/reject')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reject opportunity with feedback for issuer' })
  @ApiBody({ type: OpportunityRejectDto })
  @ApiResponse({ status: 200, description: 'Opportunity rejected' })
  @ApiResponse({ status: 400, description: 'Invalid status for rejection' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpportunityRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rejectOpportunity(id, dto, user.sub);
  }

  @Post(':id/request-changes')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Request changes for opportunity with feedback' })
  @ApiBody({ type: OpportunityRejectDto })
  @ApiResponse({ status: 200, description: 'Changes requested' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  requestChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpportunityRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.requestChangesOpportunity(id, dto, user.sub);
  }

  @Get(':id/feature-config')
  @ApiOperation({ summary: 'Get instrument-level feature config' })
  @ApiResponse({ status: 200, description: 'Feature config for opportunity' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getFeatureConfig(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getFeatureConfig(id);
  }

  @Patch(':id/feature-config')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update instrument-level feature config' })
  @ApiBody({ type: InstrumentFeatureConfigDto })
  @ApiResponse({ status: 200, description: 'Feature config updated' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  updateFeatureConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstrumentFeatureConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateFeatureConfig(id, dto, user.sub);
  }

  @Get(':id/cap-table')
  @ApiOperation({ summary: 'View cap table for an opportunity' })
  @ApiResponse({ status: 200, description: 'Cap table data' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getCapTable(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCapTable(id);
  }
}
