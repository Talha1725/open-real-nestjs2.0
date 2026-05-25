import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { PortfolioService } from './portfolio.service.js';
import { QueryPortfolioDto } from './dto/query-portfolio.dto.js';

@ApiTags('Investor - Portfolio')
@ApiBearerAuth('access-token')
@Controller('investor')
@Roles('VERIFIED')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('portfolio')
  @ApiOperation({
    summary: 'Get portfolio overview with KPIs and holdings list',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'REDEEMED', 'TRANSFERRED'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({
    status: 200,
    description: 'Portfolio KPIs and paginated holdings',
  })
  getPortfolio(
    @Query() query: QueryPortfolioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.portfolioService.getPortfolio(user.sub, query);
  }

  @Get('holdings/:id')
  @ApiOperation({ summary: 'Get holding detail with opportunity info' })
  @ApiResponse({ status: 200, description: 'Holding detail' })
  @ApiResponse({ status: 404, description: 'Holding not found' })
  getHoldingDetail(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.portfolioService.getHoldingDetail(id, user.sub);
  }

  @Get('holdings/:id/distributions')
  @ApiOperation({
    summary:
      'Get distribution history for a holding (feature flag: portfolio_distributions)',
  })
  @ApiResponse({ status: 200, description: 'Distribution list' })
  @ApiResponse({ status: 403, description: 'Feature not available' })
  @ApiResponse({ status: 404, description: 'Holding not found' })
  getDistributions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.portfolioService.getDistributions(id, user.sub);
  }

  @Get('holdings/:id/documents')
  @ApiOperation({
    summary:
      'Get statements/documents for a holding (feature flag: portfolio_statements)',
  })
  @ApiResponse({
    status: 200,
    description: 'Statement list with signed URLs',
  })
  @ApiResponse({ status: 403, description: 'Feature not available' })
  @ApiResponse({ status: 404, description: 'Holding not found' })
  getHoldingDocuments(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.portfolioService.getHoldingDocuments(id, user.sub);
  }
}
