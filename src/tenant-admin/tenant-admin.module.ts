import { Module } from '@nestjs/common';
import { TenantAdminService } from './tenant-admin.service.js';
import { TenantAdminController } from './tenant-admin.controller.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminOpportunitiesController } from './admin-opportunities.controller.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminSettingsController } from './admin-settings.controller.js';
import { JobsModule } from '../jobs/jobs.module.js';

@Module({
  imports: [JobsModule],
  controllers: [
    TenantAdminController,
    AdminDashboardController,
    AdminOpportunitiesController,
    AdminAuditController,
    AdminSettingsController,
  ],
  providers: [TenantAdminService],
  exports: [TenantAdminService],
})
export class TenantAdminModule {}
