import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequireFeature } from '../common/decorators/require-feature.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { TenantAdminService } from './tenant-admin.service.js';
import { QueryAuditLogsDto } from '../audit/dto/query-audit-logs.dto.js';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto.js';

@ApiTags('Tenant Admin - Audit')
@ApiBearerAuth('access-token')
@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AdminAuditController {
  constructor(private readonly service: TenantAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Search and browse audit logs' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'targetType', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['success', 'error', 'warning', 'info'],
  })
  @ApiQuery({
    name: 'outcome',
    required: false,
    enum: ['success', 'error', 'warning', 'info'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  getLogs(@Query() query: QueryAuditLogsDto) {
    return this.service.getAuditLogs(query);
  }

  @Post('export')
  @RequireFeature('audit_export')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Queue audit log export (CSV or PDF) — emailed when ready',
  })
  @ApiBody({ type: ExportAuditLogsDto })
  @ApiResponse({
    status: 201,
    description: 'Export queued, email will be sent with download link',
  })
  @ApiResponse({ status: 400, description: 'confirmExport must be true' })
  @ApiResponse({ status: 429, description: 'Too many export requests' })
  queueExport(
    @Body() dto: ExportAuditLogsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.queueAuditExport(dto, user.sub);
  }
}
