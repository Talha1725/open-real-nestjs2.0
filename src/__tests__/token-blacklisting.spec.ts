import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth/auth.service.js';

describe('Token blacklisting', () => {
  let authService: AuthService;
  let mockRedis: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Create a partial AuthService with only the dependencies needed for blacklisting
    authService = Object.create(AuthService.prototype);
    (authService as any).redis = mockRedis;
  });

  describe('isTokenBlacklisted', () => {
    it('returns true when token JTI exists in Redis', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await authService.isTokenBlacklisted('test-jti-123');

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('blacklist:test-jti-123');
    });

    it('returns false when token JTI does not exist in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await authService.isTokenBlacklisted('unknown-jti');

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith('blacklist:unknown-jti');
    });
  });

  describe('blacklistToken (via private method)', () => {
    it('sets the blacklist key with correct TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      // Access private method for testing
      const blacklistToken = (authService as any).blacklistToken.bind(
        authService,
      );
      await blacklistToken('jti-abc', 3600);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'blacklist:jti-abc',
        '1',
        3600,
      );
    });

    it('handles zero TTL gracefully', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const blacklistToken = (authService as any).blacklistToken.bind(
        authService,
      );
      await blacklistToken('jti-expired', 0);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'blacklist:jti-expired',
        '1',
        0,
      );
    });
  });

  describe('blacklistDecodedToken (via private method)', () => {
    let mockJwtService: {
      verify: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockJwtService = { verify: vi.fn() };
      (authService as any).jwtService = mockJwtService;
    });

    it('blacklists a valid token with remaining TTL', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 min from now
      mockJwtService.verify.mockReturnValue({
        jti: 'jti-valid',
        exp: futureExp,
      });
      mockRedis.set.mockResolvedValue('OK');

      const blacklistDecodedToken = (
        authService as any
      ).blacklistDecodedToken.bind(authService);
      await blacklistDecodedToken('some.jwt.token');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'blacklist:jti-valid',
        '1',
        expect.any(Number),
      );
      const ttl = mockRedis.set.mock.calls[0][2] as number;
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('does not blacklist an already expired token', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60; // expired 1 min ago
      mockJwtService.verify.mockReturnValue({
        jti: 'jti-expired',
        exp: pastExp,
      });

      const blacklistDecodedToken = (
        authService as any
      ).blacklistDecodedToken.bind(authService);
      await blacklistDecodedToken('some.expired.token');

      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('ignores invalid tokens without throwing', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const blacklistDecodedToken = (
        authService as any
      ).blacklistDecodedToken.bind(authService);

      // Should not throw
      await expect(
        blacklistDecodedToken('invalid.token'),
      ).resolves.toBeUndefined();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('does not blacklist tokens without jti', async () => {
      mockJwtService.verify.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 900,
      });

      const blacklistDecodedToken = (
        authService as any
      ).blacklistDecodedToken.bind(authService);
      await blacklistDecodedToken('no.jti.token');

      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });
});
