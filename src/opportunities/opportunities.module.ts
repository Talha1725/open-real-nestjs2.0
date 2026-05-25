import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service.js';
import { OpportunitiesController } from './opportunities.controller.js';

@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
