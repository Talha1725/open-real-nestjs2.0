import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantAdminService } from '../tenant-admin/tenant-admin.service.js';
import { SuperAdminService } from '../super-admin/super-admin.service.js';

describe('Tenant cache invalidation', () => {
  let prisma: any;
  let redis: any;

  beforeEach(() => {
    prisma = {
      client: {
        tenant: {
          findUnique: vi.fn(),
        },
      },
    };
    redis = {
      del: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('tenant admin invalidation deletes normalized tenant domain cache keys', async () => {
    prisma.client.tenant.findUnique.mockResolvedValue({
      domain: 'WWW.Example.COM',
      additionalDomains: ['Portal.Example.COM', 'www.Alt.EXAMPLE.com'],
    });

    const service = new TenantAdminService(
      prisma,
      { logTenantAction: vi.fn() } as any,
      { getTenantId: vi.fn().mockReturnValue('tenant-1') } as any,
      {} as any,
      redis,
      {} as any,
      {} as any,
    );

    await (service as any).invalidateTenantCache();

    expect(redis.del).toHaveBeenCalledWith('tenant:domain:example.com');
    expect(redis.del).toHaveBeenCalledWith('tenant:domain:portal.example.com');
    expect(redis.del).toHaveBeenCalledWith('tenant:domain:alt.example.com');
  });

  it('super admin invalidation deletes normalized tenant domain cache keys', async () => {
    prisma.client.tenant.findUnique.mockResolvedValue({
      domain: 'WWW.Example.COM',
      additionalDomains: ['Portal.Example.COM', 'www.Alt.EXAMPLE.com'],
    });

    const service = new SuperAdminService(
      prisma,
      redis,
      { logPlatformAction: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (service as any).invalidateTenantCache('tenant-1');

    expect(redis.del).toHaveBeenCalledWith('tenant:domain:example.com');
    expect(redis.del).toHaveBeenCalledWith('tenant:domain:portal.example.com');
    expect(redis.del).toHaveBeenCalledWith('tenant:domain:alt.example.com');
  });
});
