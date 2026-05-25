import { Module } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service.js';
import { SuperAdminController } from './super-admin.controller.js';
import { JobsModule } from '../jobs/jobs.module.js';

@Module({
  imports: [JobsModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
