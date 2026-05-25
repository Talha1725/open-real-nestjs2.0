import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('Tenant')
@Public()
@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('branding')
  @ApiOperation({ summary: 'Get tenant branding configuration (public)' })
  @ApiResponse({
    status: 200,
    description: 'Branding, legal, and support config',
  })
  getBranding() {
    return this.tenantsService.getBranding();
  }

  @Get('features')
  @ApiOperation({ summary: 'Get tenant feature flags (public)' })
  @ApiResponse({ status: 200, description: 'Feature flags object' })
  getFeatures() {
    return this.tenantsService.getFeatures();
  }
}
