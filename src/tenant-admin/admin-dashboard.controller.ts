import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TenantAdminService } from './tenant-admin.service.js';

@ApiTags('Tenant Admin - Dashboard')
@ApiBearerAuth('access-token')
@Controller('admin')
@Roles('ADMIN')
export class AdminDashboardController {
  constructor(private readonly service: TenantAdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard with KPIs and queue counts' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard KPIs and recent activity',
  })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('reports')
  @ApiOperation({ summary: 'Tenant reports and analytics' })
  @ApiResponse({ status: 200, description: 'Aggregated tenant analytics' })
  getReports() {
    return this.service.getReports();
  }
}
