import { Module } from '@nestjs/common';
import { InvestorHomeService } from './investor-home.service.js';
import { InvestorHomeController } from './investor-home.controller.js';

@Module({
  controllers: [InvestorHomeController],
  providers: [InvestorHomeService],
  exports: [InvestorHomeService],
})
export class InvestorHomeModule {}
