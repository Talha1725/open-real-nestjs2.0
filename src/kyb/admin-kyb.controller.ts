import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { KybService } from './kyb.service.js';
import { QueryKybQueueDto } from './dto/query-kyb-queue.dto.js';
import { KybRejectDto } from './dto/kyb-reject.dto.js';

@ApiTags('Tenant Admin - KYB')
@ApiBearerAuth('access-token')
@Controller('admin/kyb')
@Roles('ADMIN')
export class AdminKybController {
  constructor(private readonly kybService: KybService) {}

  @Get()
  @ApiOperation({ summary: 'KYB review queue' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'KYB review queue' })
  listQueue(@Query() query: QueryKybQueueDto) {
    return this.kybService.listKybQueue(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'KYB application detail with documents' })
  @ApiResponse({ status: 200, description: 'KYB detail' })
  @ApiResponse({ status: 404, description: 'KYB application not found' })
  getDetail(@Param('id') id: string) {
    return this.kybService.getKybDetail(id);
  }

  @Post(':id/approve')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Approve KYB — upgrades user to ISSUER role' })
  @ApiResponse({
    status: 200,
    description: 'KYB approved, user role upgraded',
  })
  @ApiResponse({ status: 400, description: 'Invalid status for approval' })
  @ApiResponse({ status: 404, description: 'KYB application not found' })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.kybService.approveKyb(id, user.sub);
  }

  @Post(':id/reject')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reject KYB with reason' })
  @ApiBody({ type: KybRejectDto })
  @ApiResponse({ status: 200, description: 'KYB rejected' })
  @ApiResponse({ status: 400, description: 'Invalid status for rejection' })
  @ApiResponse({ status: 404, description: 'KYB application not found' })
  reject(
    @Param('id') id: string,
    @Body() dto: KybRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.kybService.rejectKyb(id, dto, user.sub);
  }
}
