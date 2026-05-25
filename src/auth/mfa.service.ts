import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly tenantContext: TenantContextService,
    private readonly redis: RedisService,
  ) {}

  async generateSecret(
    userId: string,
  ): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    this.checkFeatureFlag();

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const tenantName = this.tenantContext.getTenant()?.name ?? 'OpenReal';
    if (!this.encryption.enabled) {
      throw new ForbiddenException(
        'Server security configuration error (encryption disabled)',
      );
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: tenantName,
      label: user.email,
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeUrl, otpauthUrl };
  }

  async enableMfa(
    userId: string,
    secret: string,
    token: string,
  ): Promise<{ recoveryCodes: string[] }> {
    this.checkFeatureFlag();
    if (!this.encryption.enabled) {
      throw new ForbiddenException(
        'Server security configuration error (encryption disabled)',
      );
    }

    const result = await verify({ token, secret });
    if (!result.valid) {
      throw new BadRequestException('Invalid MFA code');
    }

    // Capture replay attacks (BE-015)
    const replayKey = `mfa:used-token:${userId}:${token}`;
    if (await this.redis.get(replayKey)) {
      throw new BadRequestException('MFA code already used');
    }
    await this.redis.set(replayKey, 'used', 60);

    // Generate one-time recovery codes (BE-016)
    const recoveryCodes = this.generateRecoveryCodes();
    const encryptedSecret = this.encryption.encrypt(secret);
    const encryptedCodes = this.encryption.encrypt(
      JSON.stringify(recoveryCodes),
    );

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaRecoveryCodes: encryptedCodes,
      },
    });

    // Return plain-text codes — shown to user once only
    return { recoveryCodes };
  }

  async disableMfa(userId: string, token: string): Promise<void> {
    this.checkFeatureFlag();

    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.encryption.decrypt(user.mfaSecret);
    const result = await verify({ token, secret });
    if (!result.valid) {
      throw new BadRequestException('Invalid MFA code');
    }

    // Capture replay attacks (BE-015)
    const replayKey = `mfa:used-token:${userId}:${token}`;
    if (await this.redis.get(replayKey)) {
      throw new BadRequestException('MFA code already used');
    }
    await this.redis.set(replayKey, 'used', 60);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!user?.mfaSecret) return false;

    const secret = this.encryption.decrypt(user.mfaSecret);
    const result = await verify({ token, secret });
    if (!result.valid) return false;

    // Capture replay attacks (BE-015)
    const replayKey = `mfa:used-token:${userId}:${token}`;
    if (await this.redis.get(replayKey)) {
      return false; // Code already used
    }
    await this.redis.set(replayKey, 'used', 60);

    return true;
  }

  /**
   * Verify and burn a single MFA recovery code (BE-016).
   * Returns true if the code matched and was successfully consumed.
   */
  async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: { mfaRecoveryCodes: true },
    });
    if (!user?.mfaRecoveryCodes) return false;

    const codes: string[] = JSON.parse(
      this.encryption.decrypt(user.mfaRecoveryCodes),
    );

    const normalised = code.toUpperCase().trim();
    const idx = codes.indexOf(normalised);
    if (idx === -1) return false;

    // Burn the used code — remove it from the list
    codes.splice(idx, 1);
    const encryptedCodes = this.encryption.encrypt(JSON.stringify(codes));

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { mfaRecoveryCodes: encryptedCodes },
    });

    return true;
  }

  /** Generate 10 secure one-time recovery codes in XXXXX-XXXXX format. */
  private generateRecoveryCodes(): string[] {
    return Array.from({ length: 10 }, () => {
      const part1 = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
      const part2 = randomBytes(3).toString('hex').toUpperCase(); // 6 chars
      return `${part1}-${part2}`;
    });
  }

  private checkFeatureFlag(): void {
    const flags = this.tenantContext.getFeatureFlags() ?? {};
    if (!flags.mfa_support) {
      throw new ForbiddenException('MFA is not available for this platform');
    }
  }
}
