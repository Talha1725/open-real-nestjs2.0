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
import { QueryInvestmentRequestsDto } from './dto/query-investment-requests.dto.js';
import { AdminActionDto } from './dto/admin-action.dto.js';

@ApiTags('Tenant Admin - Investment Requests')
@ApiBearerAuth('access-token')
@Controller('admin/investment-requests')
@Roles('ADMIN')
export class AdminInvestmentRequestsController {
  constructor(private readonly service: InvestmentRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List all investment requests in tenant' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'REQUEST_CREATED',
      'PENDING_PAYMENT_CONFIRMATION',
      'CONFIRMED',
      'FAILED',
      'EXPIRED',
    ],
  })
  @ApiQuery({ name: 'opportunityId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated investment requests' })
  listRequests(@Query() query: QueryInvestmentRequestsDto) {
    return this.service.listAllRequests(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get investment request detail (admin view)' })
  @ApiResponse({ status: 200, description: 'Request detail with user info' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  getRequestDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAdminRequestDetail(id);
  }

  @Post(':id/confirm')
  @FinancialStateChangeThrottle()
  @ApiOperation({ summary: 'Confirm payment received — creates holding' })
  @ApiBody({ type: AdminActionDto })
  @ApiResponse({
    status: 200,
    description: 'Request confirmed, holding created',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 400, description: 'Invalid status for confirmation' })
  confirmRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.confirmRequest(id, user.sub, dto.reason);
  }

  @Post(':id/fail')
  @FinancialStateChangeThrottle()
  @ApiOperation({ summary: 'Mark request as failed' })
  @ApiBody({ type: AdminActionDto })
  @ApiResponse({ status: 200, description: 'Request marked as failed' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 400, description: 'Invalid status for failure' })
  failRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.failRequest(id, user.sub, dto.reason);
  }

  @Post('expire-stale')
  @FinancialStateChangeThrottle()
  @ApiOperation({
    summary: 'Manually expire stale investment requests past their expiry date',
  })
  @ApiResponse({
    status: 200,
    description: 'Count of expired requests',
  })
  expireStale() {
    return this.service.expireRequests();
  }
}
