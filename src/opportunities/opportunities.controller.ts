import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { OpportunitiesService } from './opportunities.service.js';

@ApiTags('Investor - Opportunities')
@ApiBearerAuth('access-token')
@Controller('investor/opportunities')
@Roles('VERIFIED')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get full opportunity detail' })
  @ApiResponse({
    status: 200,
    description: 'Opportunity detail with all content sections',
  })
  @ApiResponse({
    status: 404,
    description: 'Opportunity not found or not available',
  })
  getDetail(@Param('id') id: string) {
    return this.opportunitiesService.getOpportunityDetail(id);
  }

  @Get(':id/documents')
  @ApiOperation({
    summary: 'Get opportunity documents with signed download URLs',
  })
  @ApiResponse({ status: 200, description: 'Document list with signed URLs' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getDocuments(@Param('id') id: string) {
    return this.opportunitiesService.getOpportunityDocuments(id);
  }

  @Get(':id/similar')
  @ApiOperation({
    summary: 'Get similar opportunities (same asset class or region)',
  })
  @ApiResponse({ status: 200, description: 'Up to 4 similar opportunities' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getSimilar(@Param('id') id: string) {
    return this.opportunitiesService.getSimilarOpportunities(id);
  }

  @Get(':id/request-config')
  @ApiOperation({
    summary: 'Get investment request configuration (amounts, acknowledgements)',
  })
  @ApiResponse({
    status: 200,
    description: 'Config for investment request form',
  })
  @ApiResponse({
    status: 404,
    description: 'Opportunity not found or not accepting investments',
  })
  getRequestConfig(@Param('id') id: string) {
    return this.opportunitiesService.getRequestConfig(id);
  }
}
