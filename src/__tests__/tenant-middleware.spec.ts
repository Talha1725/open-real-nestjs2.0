import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { TenantContextMiddleware } from '../common/middleware/tenant-context.middleware.js';

function mockReq(hostname: string, query: Record<string, string> = {}) {
  return {
    hostname,
    headers: { host: hostname },
    query,
  } as any;
}

const mockRes = {} as any;

describe('TenantContextMiddleware', () => {
  let middleware: TenantContextMiddleware;
  let mockPrisma: any;
  let mockRedis: any;
  let mockTenantContext: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        tenant: {
          findFirst: vi.fn(),
        },
      },
    };

    mockRedis = {
      getJSON: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn().mockResolvedValue(undefined),
    };

    mockTenantContext = {
      run: vi.fn((store: any, cb: () => void) => cb()),
    };

    mockConfig = {
      get: vi.fn().mockReturnValue('test'),
    };

    middleware = new TenantContextMiddleware(
      mockPrisma,
      mockRedis,
      mockTenantContext,
      mockConfig,
    );
  });

  it('throws NotFoundException for unknown domain', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue(null);

    await expect(
      middleware.use(mockReq('unknown.example.com'), mockRes, vi.fn()),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException with "Platform not found" message', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue(null);

    await expect(
      middleware.use(mockReq('unknown.example.com'), mockRes, vi.fn()),
    ).rejects.toThrow('Platform not found');
  });

  it('throws ServiceUnavailableException for suspended tenant', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue({
      id: 'tenant-1',
      name: 'Test',
      slug: 'test',
      domain: 'test.example.com',
      status: 'SUSPENDED',
      featureTier: 'STARTER',
      config: null,
    });

    await expect(
      middleware.use(mockReq('test.example.com'), mockRes, vi.fn()),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('TEN-08: suspended tenant domain requests are blocked with 503 behavior', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue({
      id: 'tenant-suspended',
      name: 'Suspended Tenant',
      slug: 'suspended',
      domain: 'suspended.example.com',
      status: 'SUSPENDED',
      featureTier: 'STARTER',
      config: null,
    });

    await expect(
      middleware.use(mockReq('suspended.example.com'), mockRes, vi.fn()),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws NotFoundException for deactivated tenant', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue({
      id: 'tenant-2',
      name: 'Deactivated',
      slug: 'deactivated',
      domain: 'dead.example.com',
      status: 'DEACTIVATED',
      featureTier: 'STARTER',
      config: null,
    });

    await expect(
      middleware.use(mockReq('dead.example.com'), mockRes, vi.fn()),
    ).rejects.toThrow(NotFoundException);
  });

  it('calls next() for active tenant and wraps in tenant context', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue({
      id: 'tenant-active',
      name: 'Active Tenant',
      slug: 'active',
      domain: 'active.example.com',
      status: 'ACTIVE',
      featureTier: 'PROFESSIONAL',
      config: {
        branding: {},
        legal: {},
        support: {},
        email: {},
        features: { market_overview: true },
        integrations: {},
        workflows: {},
      },
    });

    const next = vi.fn();
    const req = mockReq('active.example.com');

    await middleware.use(req, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-active');
    expect(mockTenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-active' }),
      expect.any(Function),
    );
  });

  it('uses Redis cache when available', async () => {
    const cached = {
      tenant: {
        id: 'cached-tenant',
        name: 'Cached',
        slug: 'cached',
        domain: 'cached.example.com',
        status: 'ACTIVE',
        featureTier: 'STARTER',
      },
      config: null,
    };
    mockRedis.getJSON.mockResolvedValue(cached);

    const next = vi.fn();
    const req = mockReq('cached.example.com');

    await middleware.use(req, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('cached-tenant');
    // Should NOT query DB when cache hit
    expect(mockPrisma.client.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('strips www. prefix from hostname', async () => {
    mockPrisma.client.tenant.findFirst.mockResolvedValue(null);

    await expect(
      middleware.use(mockReq('www.unknown.com'), mockRes, vi.fn()),
    ).rejects.toThrow(NotFoundException);

    // Should query with stripped hostname
    const call = mockPrisma.client.tenant.findFirst.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { domain: 'unknown.com' },
      { additionalDomains: { has: 'unknown.com' } },
    ]);
  });

  it('falls back to ?tenant=slug in development mode', async () => {
    // Re-create middleware with isDev = true
    mockConfig.get.mockReturnValue('development');
    middleware = new TenantContextMiddleware(
      mockPrisma,
      mockRedis,
      mockTenantContext,
      mockConfig,
    );

    // Hostname lookup returns null, slug lookup returns tenant
    mockPrisma.client.tenant.findFirst
      .mockResolvedValueOnce(null) // hostname lookup
      .mockResolvedValueOnce({
        id: 'slug-tenant',
        name: 'Slug Tenant',
        slug: 'slugtest',
        domain: 'slug.example.com',
        status: 'ACTIVE',
        featureTier: 'STARTER',
        config: null,
      });

    const next = vi.fn();
    const req = mockReq('localhost', { tenant: 'slugtest' });

    await middleware.use(req, mockRes, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('slug-tenant');
  });
});
