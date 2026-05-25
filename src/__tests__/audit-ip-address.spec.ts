import { describe, it, expect, vi } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';

describe('AuditService ipAddress capture', () => {
  it('defaults ipAddress from TenantContext when not provided', async () => {
    const prisma: any = {
      client: {
        auditLogEvent: {
          create: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    const tenantContext: any = {
      getTenantId: vi.fn().mockReturnValue('tenant-1'),
      getIpAddress: vi.fn().mockReturnValue('203.0.113.10'),
    };

    const service = new AuditService(prisma, tenantContext);

    await service.log({
      actorId: 'user-1',
      action: AuditAction.USER_LOGIN,
      targetType: 'User',
      targetId: 'user-1',
    } as any);

    expect(prisma.client.auditLogEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: '203.0.113.10',
        }),
      }),
    );
  });
});
