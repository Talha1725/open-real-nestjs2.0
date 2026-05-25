import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { SuperAdminService } from './super-admin.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { UpdateFeaturesDto } from './dto/update-features.dto.js';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto.js';
import { CreateUserDto } from '../tenant-admin/dto/create-user.dto.js';
import { QueryPlatformLogsDto } from './dto/query-platform-logs.dto.js';

@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@Controller('super-admin')
@Roles('SUPER_ADMIN')
@Throttle({ default: { limit: 500, ttl: 60_000 } })
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform dashboard KPIs' })
  @ApiResponse({ status: 200, description: 'Dashboard metrics returned' })
  getDashboard() {
    return this.superAdminService.getDashboard();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants' })
  @ApiResponse({ status: 200, description: 'Array of tenants' })
  listTenants() {
    return this.superAdminService.listTenants();
  }

  @Post('tenants')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Create a new tenant with initial admin' })
  @ApiBody({ type: CreateTenantDto })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  @ApiResponse({ status: 409, description: 'Slug or domain already exists' })
  createTenant(@Body() dto: CreateTenantDto, @CurrentUser() user: JwtPayload) {
    return this.superAdminService.createTenant(dto, user.sub);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Get tenant detail with config and counts' })
  @ApiResponse({ status: 200, description: 'Tenant detail returned' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getTenant(@Param('id') id: string) {
    return this.superAdminService.getTenant(id);
  }

  @Patch('tenants/:id')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update tenant name, domain, or tier' })
  @ApiBody({ type: UpdateTenantDto })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Domain already in use' })
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.updateTenant(id, dto, user.sub);
  }

  @Patch('tenants/:id/features')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update feature flags for a tenant' })
  @ApiBody({ type: UpdateFeaturesDto })
  @ApiResponse({ status: 200, description: 'Features updated' })
  @ApiResponse({ status: 404, description: 'Tenant config not found' })
  updateFeatures(
    @Param('id') id: string,
    @Body() dto: UpdateFeaturesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.updateFeatures(id, dto, user.sub);
  }

  @Post('tenants/:id/suspend')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Suspend a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant suspended' })
  @ApiResponse({ status: 400, description: 'Tenant is not active' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  suspendTenant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.superAdminService.suspendTenant(id, user.sub);
  }

  @Post('tenants/:id/reactivate')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reactivate a suspended tenant' })
  @ApiResponse({ status: 200, description: 'Tenant reactivated' })
  @ApiResponse({ status: 400, description: 'Tenant is not suspended' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  reactivateTenant(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.superAdminService.reactivateTenant(id, user.sub);
  }

  @Get('tenants/:id/admins')
  @ApiOperation({ summary: 'List admin users for a tenant' })
  @ApiResponse({ status: 200, description: 'Array of admin users' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getTenantAdmins(@Param('id') id: string) {
    return this.superAdminService.getTenantAdmins(id);
  }

  @Post('tenants/:id/admins')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Create an admin user for a tenant' })
  @ApiBody({ type: CreateTenantAdminDto })
  @ApiResponse({ status: 201, description: 'Admin created' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createTenantAdmin(
    @Param('id') id: string,
    @Body() dto: CreateTenantAdminDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.createTenantAdmin(id, dto, user.sub);
  }

  @Post('tenants/:id/users')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Create any user for a tenant (any role)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createUserForTenant(
    @Param('id') id: string,
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superAdminService.createUserForTenant(id, dto, user.sub);
  }

  @Get('tenants/:id/analytics')
  @ApiOperation({ summary: 'Per-tenant analytics breakdown' })
  @ApiResponse({ status: 200, description: 'Analytics data returned' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getTenantAnalytics(@Param('id') id: string) {
    return this.superAdminService.getTenantAnalytics(id);
  }

  @Get('platform/jobs')
  @ApiOperation({ summary: 'Get platform job queue stats' })
  @ApiResponse({ status: 200, description: 'Queue stats returned' })
  getPlatformJobs() {
    return this.superAdminService.getPlatformJobStats();
  }

  @Get('platform/health')
  @ApiOperation({ summary: 'Platform health checks (DB, Redis, S3)' })
  @ApiResponse({ status: 200, description: 'Health check results' })
  getPlatformHealth() {
    return this.superAdminService.getPlatformHealth();
  }

  @Get('platform/logs')
  @ApiOperation({ summary: 'Cross-tenant audit trail' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit logs across all tenants',
  })
  getPlatformLogs(@Query() query: QueryPlatformLogsDto) {
    return this.superAdminService.getPlatformLogs(query);
  }
}
