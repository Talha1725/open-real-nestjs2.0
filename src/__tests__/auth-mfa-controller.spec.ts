import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../auth/auth.controller.js';

describe('AuthController MFA flow', () => {
  let controller: AuthController;
  let authService: any;
  let res: any;

  beforeEach(() => {
    authService = {
      login: vi.fn(),
      googleAuth: vi.fn(),
      loginMfa: vi.fn(),
    };
    controller = new AuthController(authService);
    res = {
      append: vi.fn(),
    };
  });

  it('returns mfaToken in login response when MFA is required', async () => {
    authService.login.mockResolvedValue({
      requiresMfa: true,
      mfaToken: 'temp-mfa-token',
    });

    const result = await controller.login(
      { email: 'user@example.com', password: 'secret' } as any,
      res,
    );

    expect(result).toEqual({
      requiresMfa: true,
      mfaToken: 'temp-mfa-token',
    });
    expect(res.append).toHaveBeenCalled();
  });

  it('supports MFA alias endpoint', async () => {
    authService.loginMfa.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const result = await controller.loginMfaAlias(
      { mfaToken: 'temp-mfa-token', code: '123456' } as any,
      {},
      res,
    );

    expect(authService.loginMfa).toHaveBeenCalledWith({
      mfaToken: 'temp-mfa-token',
      code: '123456',
    });
    expect(result).toEqual({ user: { id: 'u1' } });
  });

  it('uses the same cookie session flow for Google auth', async () => {
    authService.googleAuth.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const result = await controller.googleAuth(
      { credential: 'google-id-token' } as any,
      res,
    );

    expect(authService.googleAuth).toHaveBeenCalledWith({
      credential: 'google-id-token',
    });
    expect(result).toEqual({ user: { id: 'u1' } });
    expect(res.append).toHaveBeenCalled();
  });
});
