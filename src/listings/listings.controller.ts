import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ListingsService } from './listings.service.js';
import { QueryListingsDto } from './dto/query-listings.dto.js';

@ApiTags('Investor - Listings')
@ApiBearerAuth('access-token')
@Controller('investor/listings')
@Roles('VERIFIED')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse available investment opportunities' })
  @ApiQuery({
    name: 'assetClass',
    required: false,
    enum: [
      'REAL_ESTATE',
      'INFRASTRUCTURE',
      'PRIVATE_EQUITY',
      'PRIVATE_CREDIT',
      'COMMODITIES',
      'ART_AND_COLLECTIBLES',
      'OTHER',
    ],
  })
  @ApiQuery({
    name: 'region',
    required: false,
    enum: [
      'NORTH_AMERICA',
      'EUROPE',
      'ASIA_PACIFIC',
      'MIDDLE_EAST',
      'AFRICA',
      'LATIN_AMERICA',
      'GLOBAL',
    ],
  })
  @ApiQuery({ name: 'status', required: false, enum: ['LIVE', 'CLOSED'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated listings' })
  listListings(@Query() query: QueryListingsDto) {
    return this.listingsService.listListings(query);
  }
}
