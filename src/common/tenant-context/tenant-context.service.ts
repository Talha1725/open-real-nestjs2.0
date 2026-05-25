import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantBasicInfo {
  id: string;
  name: string;
  slug: string;
  domain: string;
  featureTier: string;
}

export interface TenantStore {
  tenantId: string;
  tenant: TenantBasicInfo;
  tenantConfig: any;
  featureFlags: any;
  ipAddress?: string | null;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  getTenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  getTenant(): TenantBasicInfo | undefined {
    return this.als.getStore()?.tenant;
  }

  getTenantConfig(): any {
    return this.als.getStore()?.tenantConfig;
  }

  getFeatureFlags(): any {
    return this.als.getStore()?.featureFlags;
  }

  getIpAddress(): string | null | undefined {
    return this.als.getStore()?.ipAddress;
  }
}
