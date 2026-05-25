import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { FinancialStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { InvestmentRequestsService } from './investment-requests.service.js';
import { CreateInvestmentRequestDto } from './dto/create-investment-request.dto.js';

@ApiTags('Investor - Investment Requests')
@ApiBearerAuth('access-token')
@Controller('investor/investment-requests')
@Roles('VERIFIED')
export class InvestmentRequestsController {
  constructor(private readonly service: InvestmentRequestsService) {}

  @Post()
  @FinancialStateChangeThrottle()
  @ApiOperation({ summary: 'Submit an investment request' })
  @ApiBody({ type: CreateInvestmentRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Request created with payment instructions',
  })
  @ApiResponse({ status: 409, description: 'Active request already exists' })
  createRequest(
    @Body() dto: CreateInvestmentRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createRequest(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List my investment requests' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated list of requests' })
  listMyRequests(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getUserRequests(user.sub, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get investment request detail with payment instructions',
  })
  @ApiResponse({ status: 200, description: 'Request detail' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  getRequestDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getRequestDetail(id, user.sub);
  }
}
