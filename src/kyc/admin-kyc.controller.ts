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
import { KycService } from './kyc.service.js';
import { QueryKycQueueDto } from './dto/query-kyc-queue.dto.js';
import { KycRejectDto } from './dto/kyc-reject.dto.js';

@ApiTags('Tenant Admin - KYC')
@ApiBearerAuth('access-token')
@Controller('admin/kyc')
@Roles('ADMIN')
export class AdminKycController {
  constructor(private readonly kycService: KycService) {}

  @Get()
  @ApiOperation({ summary: 'KYC review queue' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'NOT_STARTED',
      'IN_PROGRESS',
      'PENDING_REVIEW',
      'APPROVED',
      'REJECTED',
    ],
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'KYC review queue' })
  listQueue(@Query() query: QueryKycQueueDto) {
    return this.kycService.listKycQueue(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'KYC applicant detail' })
  @ApiResponse({ status: 200, description: 'Verification detail' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  getDetail(@Param('id') id: string) {
    return this.kycService.getKycDetail(id);
  }

  @Post(':id/approve')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Approve KYC — upgrades user to VERIFIED role' })
  @ApiResponse({
    status: 200,
    description: 'KYC approved, user role upgraded',
  })
  @ApiResponse({ status: 400, description: 'Invalid status for approval' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.kycService.approveKyc(id, user.sub);
  }

  @Post(':id/reject')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reject KYC with reason' })
  @ApiBody({ type: KycRejectDto })
  @ApiResponse({ status: 200, description: 'KYC rejected' })
  @ApiResponse({ status: 400, description: 'Invalid status for rejection' })
  @ApiResponse({ status: 404, description: 'Verification not found' })
  reject(
    @Param('id') id: string,
    @Body() dto: KycRejectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.kycService.rejectKyc(id, dto, user.sub);
  }
}
