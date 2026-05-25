import { InternalServerErrorException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { InvestmentRequestsService } from '../investment-requests/investment-requests.service.js';

describe('InvestmentRequestsService.confirmRequest transaction safety', () => {
  it.each(['accountName', 'iban', 'bankName', 'swift'])(
    'B-04: throws when tenant payment %s is not configured',
    async (missingField) => {
      const paymentConfig = {
        accountName: 'OpenReal Client Account',
        iban: 'GB29NWBK60161331926819',
        bankName: 'National Westminster Bank',
        swift: 'NWBKGB2L',
      };
      delete paymentConfig[missingField as keyof typeof paymentConfig];

      const prisma: any = {
        client: {
          opportunity: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'opp-1',
              status: 'LIVE',
              currency: 'USD',
              minimumAmount: 100,
              maximumAmount: 10000,
            }),
          },
          investmentRequest: {
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
          },
          paymentInstruction: {
            create: vi.fn(),
          },
        },
      };

      const service = new InvestmentRequestsService(
        prisma,
        {
          getTenantId: vi.fn().mockReturnValue('tenant-1'),
          getTenantConfig: vi.fn().mockReturnValue({
            workflows: {},
            integrations: { paymentConfig },
          }),
          getTenant: vi.fn().mockReturnValue({ slug: 'tenant' }),
        } as any,
        { logTenantAction: vi.fn() } as any,
        { encrypt: vi.fn(), decrypt: vi.fn() } as any,
        { sealPrimaryIssuance: vi.fn() } as any,
        { mirrorPrimaryIssuance: vi.fn() } as any,
        { create: vi.fn() } as any,
      );

      await expect(
        service.createRequest(
          {
            opportunityId: 'opp-1',
            amount: 1000,
            acknowledgements: [],
          },
          'user-1',
        ),
      ).rejects.toThrow(
        `Tenant payment configuration is incomplete: ${missingField} is not configured`,
      );

      expect(prisma.client.investmentRequest.count).not.toHaveBeenCalled();
      expect(prisma.client.investmentRequest.create).not.toHaveBeenCalled();
      expect(prisma.client.paymentInstruction.create).not.toHaveBeenCalled();
    },
  );

  it('B-04: throws when tenant payment config is missing', async () => {
    const prisma: any = {
      client: {
        opportunity: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'opp-1',
            status: 'LIVE',
            currency: 'USD',
            minimumAmount: 100,
            maximumAmount: 10000,
          }),
        },
        investmentRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
        },
        paymentInstruction: {
          create: vi.fn(),
        },
      },
    };

    const service = new InvestmentRequestsService(
      prisma,
      {
        getTenantId: vi.fn().mockReturnValue('tenant-1'),
        getTenantConfig: vi.fn().mockReturnValue({
          workflows: {},
          integrations: {},
        }),
        getTenant: vi.fn().mockReturnValue({ slug: 'tenant' }),
      } as any,
      { logTenantAction: vi.fn() } as any,
      { encrypt: vi.fn(), decrypt: vi.fn() } as any,
      { sealPrimaryIssuance: vi.fn() } as any,
      { mirrorPrimaryIssuance: vi.fn() } as any,
      { create: vi.fn() } as any,
    );

    await expect(
      service.createRequest(
        {
          opportunityId: 'opp-1',
          amount: 1000,
          acknowledgements: [],
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(prisma.client.investmentRequest.create).not.toHaveBeenCalled();
    expect(prisma.client.paymentInstruction.create).not.toHaveBeenCalled();
  });

  it('FND-02: does not confirm request if registry sealing fails', async () => {
    const tx: any = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      investmentRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'req-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          opportunityId: 'opp-1',
          amount: 100,
          currency: 'USD',
          status: 'REQUEST_CREATED',
          referenceNumber: 'TENANT-2026-000001',
          statusHistory: [],
        }),
        update: vi.fn(),
      },
      holding: {
        create: vi.fn().mockResolvedValue({
          id: 'hold-1',
          units: 100,
          acquisitionDate: new Date(),
          status: 'ACTIVE',
        }),
      },
    };

    const prisma: any = {
      client: {
        $transaction: vi.fn(async (fn: any) => fn(tx)),
      },
    };

    const registryEngine: any = {
      sealPrimaryIssuance: vi
        .fn()
        .mockRejectedValue(new Error('registry down')),
    };

    const service = new InvestmentRequestsService(
      prisma,
      { getTenantId: vi.fn() } as any,
      { logTenantAction: vi.fn() } as any,
      { encrypt: vi.fn(), decrypt: vi.fn() } as any,
      registryEngine,
      { mirrorPrimaryIssuance: vi.fn() } as any,
      { create: vi.fn() } as any,
    );

    await expect(service.confirmRequest('req-1', 'admin-1')).rejects.toThrow(
      'registry down',
    );

    expect(tx.investmentRequest.update).not.toHaveBeenCalled();
  });
});
