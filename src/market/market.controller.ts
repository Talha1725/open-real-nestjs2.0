import {
  Controller,
  Get,
  Post,
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
import { FinancialStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import { MarketService } from './market.service.js';

@ApiTags('Market (Secondary)')
@ApiBearerAuth('access-token')
@Roles('VERIFIED')
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Post('orders')
  @FinancialStateChangeThrottle()
  @ApiOperation({
    summary: 'Place an order (dormant — requires secondary market)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', format: 'uuid' },
      },
      required: ['opportunityId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Market trading not yet enabled' })
  @ApiResponse({
    status: 403,
    description: 'Secondary market not enabled for this instrument',
  })
  async placeOrder(
    @Body('opportunityId', ParseUUIDPipe) opportunityId: string,
  ) {
    await this.marketService.guardMarketAccess(opportunityId);
    return { message: 'Market trading not yet enabled' };
  }

  @Get('orders')
  @ApiOperation({
    summary: 'List orders (dormant — requires secondary market)',
  })
  @ApiQuery({ name: 'opportunityId', required: true })
  @ApiResponse({ status: 200, description: 'Market trading not yet enabled' })
  async listOrders(
    @Query('opportunityId', ParseUUIDPipe) opportunityId: string,
  ) {
    await this.marketService.guardMarketAccess(opportunityId);
    return { message: 'Market trading not yet enabled' };
  }

  @Get('orders/:id')
  @ApiOperation({
    summary: 'Get order detail (dormant — requires secondary market)',
  })
  @ApiQuery({ name: 'opportunityId', required: true })
  @ApiResponse({ status: 200, description: 'Market trading not yet enabled' })
  async getOrder(
    @Param('id', ParseUUIDPipe) _id: string,
    @Query('opportunityId', ParseUUIDPipe) opportunityId: string,
  ) {
    await this.marketService.guardMarketAccess(opportunityId);
    return { message: 'Market trading not yet enabled' };
  }
}
