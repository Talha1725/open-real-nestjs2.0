import { Module, forwardRef } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { JobsWorker } from './jobs.worker.js';
import { InvestmentRequestExpiryHandler } from './handlers/investment-request-expiry.handler.js';
import { AuditExportHandler } from './handlers/audit-export.handler.js';
import { PriorityWindowExpiryHandler } from './handlers/priority-window-expiry.handler.js';
import { TransferModule } from '../transfer/transfer.module.js';

@Module({
  imports: [forwardRef(() => TransferModule)],
  providers: [
    JobsService,
    JobsWorker,
    InvestmentRequestExpiryHandler,
    AuditExportHandler,
    PriorityWindowExpiryHandler,
  ],
  exports: [JobsService],
})
export class JobsModule {}
