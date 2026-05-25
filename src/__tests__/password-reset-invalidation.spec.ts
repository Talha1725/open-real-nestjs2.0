import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';

describe('Password reset token invalidation', () => {
  let jwtService: any;
  let redis: any;
  let prisma: any;
  let service: AuthService;

  beforeEach(() => {
    jwtService = {
      verify: vi.fn(),
      sign: vi.fn(),
    };

    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    prisma = {
      client: {
        user: {
          findFirst: vi.fn(),
          update: vi.fn(),
        },
      },
    };

    service = new AuthService(
      prisma,
      jwtService,
      { get: vi.fn().mockReturnValue('secret') } as any,
      { getTenantId: vi.fn().mockReturnValue('tenant-1') } as any,
      { log: vi.fn() } as any,
      { sendPasswordChanged: vi.fn() } as any,
      redis,
      { verifyRecoveryCode: vi.fn(), verifyToken: vi.fn() } as any,
    );
  });

  it('FND-06: rejects already-used password reset token (blacklisted jti)', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      purpose: 'password-reset',
      jti: 'reset-jti',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    redis.get.mockResolvedValueOnce('1'); // blacklisted

    await expect(
      service.resetPassword({ token: 't', password: 'NewPass123!' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blacklists the reset token after a successful password reset', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      purpose: 'password-reset',
      jti: 'reset-jti',
      exp,
    });

    prisma.client.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'u@test.com',
      fullName: 'User',
    });

    await service.resetPassword({ token: 't', password: 'NewPass123!' } as any);

    expect(redis.set).toHaveBeenCalledWith(
      'blacklist:reset-jti',
      '1',
      expect.any(Number),
    );
  });
});
