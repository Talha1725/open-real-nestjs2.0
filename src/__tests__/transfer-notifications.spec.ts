import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferService } from '../transfer/transfer.service.js';

describe('Transfer notifications', () => {
  let prisma: any;
  let audit: any;
  let notifications: any;
  let service: TransferService;

  beforeEach(() => {
    prisma = {
      client: {
        $transaction: vi.fn(async (fn: any) => fn(prisma.client)),
        transferCase: {
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue(undefined),
        },
        transferStatusHistory: {
          create: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    audit = {
      logTenantAction: vi.fn().mockResolvedValue(undefined),
    };

    notifications = {
      create: vi.fn().mockResolvedValue(undefined),
    };

    service = new TransferService(
      prisma,
      { getTenant: vi.fn() } as any,
      audit,
      { addJob: vi.fn() } as any,
      { evaluate: vi.fn() } as any,
      { executeTransfer: vi.fn() } as any,
      { mirrorTransfer: vi.fn(), mirrorPrimaryIssuance: vi.fn() } as any,
      notifications,
    );
  });

  it('NB-11: status change sends TRANSFER_UPDATE notification', async () => {
    prisma.client.transferCase.findUnique.mockResolvedValue({
      id: 'case-1',
      tenantId: 'tenant-1',
      reference: 'OPENREAL-2026-TX-000001',
      sellerId: 'seller-1',
      status: 'MANAGER_REVIEW',
    });

    const result = await service.cancelTransfer('case-1', 'seller-1');

    expect(result.status).toBe('CANCELLED');
    expect(notifications.create).toHaveBeenCalledWith(
      'tenant-1',
      'seller-1',
      'TRANSFER_UPDATE',
      'Transfer Cancelled',
      expect.stringContaining('cancelled'),
    );
  });
});
