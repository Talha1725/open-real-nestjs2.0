import { Module } from '@nestjs/common';
import { KybService } from './kyb.service.js';
import { KybController } from './kyb.controller.js';
import { AdminKybController } from './admin-kyb.controller.js';

@Module({
  controllers: [KybController, AdminKybController],
  providers: [KybService],
  exports: [KybService],
})
export class KybModule {}
