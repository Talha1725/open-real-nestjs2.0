import { Module, forwardRef } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { TransferService } from './transfer.service.js';
import { RulesEngineService } from './rules-engine.service.js';
import { RegistryEngineService } from './registry-engine.service.js';
import { TokenAdapterService } from './token-adapter.service.js';
import { TransferController } from './controllers/transfer.controller.js';
import { TransferIssuerController } from './controllers/transfer-issuer.controller.js';
import { TransferAdminController } from './controllers/transfer-admin.controller.js';
import { TransferBuyerInvitationsController } from './controllers/transfer-buyer-invitations.controller.js';

@Module({
  imports: [forwardRef(() => JobsModule)],
  controllers: [
    TransferController,
    TransferIssuerController,
    TransferBuyerInvitationsController,
    TransferAdminController,
  ],
  providers: [
    TransferService,
    RulesEngineService,
    RegistryEngineService,
    TokenAdapterService,
  ],
  exports: [TransferService, RegistryEngineService, TokenAdapterService],
})
export class TransferModule {}
