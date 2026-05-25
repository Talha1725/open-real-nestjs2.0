import { Module } from '@nestjs/common';
import { InvestmentRequestsService } from './investment-requests.service.js';
import { InvestmentRequestsController } from './investment-requests.controller.js';
import { AdminInvestmentRequestsController } from './admin-investment-requests.controller.js';
import { TransferModule } from '../transfer/transfer.module.js';

@Module({
  imports: [TransferModule],
  controllers: [
    InvestmentRequestsController,
    AdminInvestmentRequestsController,
  ],
  providers: [InvestmentRequestsService],
  exports: [InvestmentRequestsService],
})
export class InvestmentRequestsModule {}
