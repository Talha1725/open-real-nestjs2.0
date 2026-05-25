import { Injectable, BadRequestException } from '@nestjs/common';
import type { KycProvider } from './interfaces/kyc-provider.interface.js';
import { SumsubProvider } from './providers/sumsub.provider.js';

@Injectable()
export class KycProviderFactory {
  private providers = new Map<string, KycProvider>();

  constructor(private readonly sumsubProvider: SumsubProvider) {
    this.providers.set('sumsub', sumsubProvider);
  }

  getProvider(providerName: string): KycProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(
        `KYC provider "${providerName}" is not supported`,
      );
    }
    return provider;
  }
}
