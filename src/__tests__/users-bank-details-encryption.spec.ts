import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users.service.js';

describe('UsersService bank details encryption', () => {
  let prisma: any;
  let encryption: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      client: {
        bankDetails: {
          upsert: vi.fn(),
        },
      },
    };
    encryption = {
      encrypt: vi.fn((value: string) => `enc:${value}`),
      decrypt: vi.fn((value: string) =>
        value.startsWith('enc:') ? value.slice(4) : value,
      ),
    };

    service = new UsersService(
      prisma,
      { getTenantId: vi.fn().mockReturnValue('tenant-1') } as any,
      {} as any,
      {} as any,
      encryption,
      {} as any,
      {} as any,
    );
  });

  it('encrypts iban, account number, and swift bic before persisting', async () => {
    prisma.client.bankDetails.upsert.mockResolvedValue({
      id: 'bd-1',
      accountHolderName: 'Jane Doe',
      iban: 'enc:GB29NWBK60161331926819',
      accountNumber: 'enc:12345678',
      bankName: 'NatWest',
      swiftBic: 'enc:NWBKGB2L',
      sortCode: '12-34-56',
      currency: 'GBP',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.updateBankDetails('user-1', {
      accountHolderName: 'Jane Doe',
      iban: 'GB29NWBK60161331926819',
      accountNumber: '12345678',
      bankName: 'NatWest',
      swiftBic: 'NWBKGB2L',
      sortCode: '12-34-56',
      currency: 'GBP',
    });

    expect(prisma.client.bankDetails.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          iban: 'enc:GB29NWBK60161331926819',
          accountNumber: 'enc:12345678',
          swiftBic: 'enc:NWBKGB2L',
        }),
        update: expect.objectContaining({
          iban: 'enc:GB29NWBK60161331926819',
          accountNumber: 'enc:12345678',
          swiftBic: 'enc:NWBKGB2L',
        }),
      }),
    );

    expect(result.iban).toBe('GB29NWBK60161331926819');
    expect(result.accountNumber).toBe('12345678');
    expect(result.swiftBic).toBe('NWBKGB2L');
  });
});
