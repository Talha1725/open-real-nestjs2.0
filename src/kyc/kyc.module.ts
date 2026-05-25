import { Module } from '@nestjs/common';
import { KycService } from './kyc.service.js';
import { AdminKycController } from './admin-kyc.controller.js';
import { KycWebhookController } from './kyc-webhook.controller.js';
import { SumsubProvider } from './providers/sumsub.provider.js';
import { KycProviderFactory } from './kyc-provider.factory.js';

@Module({
  controllers: [AdminKycController, KycWebhookController],
  providers: [KycService, SumsubProvider, KycProviderFactory],
  exports: [KycService, KycProviderFactory],
})
export class KycModule {}
