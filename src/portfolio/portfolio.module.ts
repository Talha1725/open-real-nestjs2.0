import { Module } from '@nestjs/common';
import { PortfolioService } from './portfolio.service.js';
import { PortfolioController } from './portfolio.controller.js';
import { AdminPortfolioController } from './admin-portfolio.controller.js';

@Module({
  controllers: [PortfolioController, AdminPortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
