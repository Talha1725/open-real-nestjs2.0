import { User } from "@prisma/client";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { SafeUser } from '../common/interfaces/safe-user.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';
import { MfaService } from './mfa.service.js';
import { MfaLoginDto } from './dto/mfa-login.dto.js';
import { GoogleAuthDto } from './dto/google-auth.dto.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshSecret: string;
  private readonly refreshExpiry: string;
  private readonly accessExpiry: string;
  private readonly googleClientId?: string;
  private readonly googleClient?: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
    private readonly mfaService: MfaService,
    private readonly encryption: EncryptionService,
  ) {
    this.refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;
    this.refreshExpiry = this.configService.get<string>(
      'JWT_REFRESH_EXPIRY',
      '7d',
    );
    this.accessExpiry = this.configService.get<string>(
      'JWT_ACCESS_EXPIRY',
      '15m',
    );
    this.googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (this.googleClientId) {
      this.googleClient = new OAuth2Client(this.googleClientId);
    }
  }

  async register(dto: RegisterDto): Promise<{
    user: SafeUser;
    accessToken?: string;
    refreshToken?: string;
  }> {
    const tenantId = this.tenantContext.getTenantId()!;

    const existing = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.client.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        fullName: this.encryption.encrypt(dto.fullName),
      },
    });

    const emailVerificationToken = this.jwtService.sign(
      { sub: user.id, tenantId, purpose: 'email-verification' },
      { expiresIn: '24h' },
    );
    this.logger.debug(`Email verification token generated for ${dto.email}`);

    await this.auditService.log({
      actorId: user.id,
      action: AuditAction.USER_CREATED,
      targetType: 'User',
      targetId: user.id,
      details: { email: user.email },
    });

    await this.emailService.sendEmailVerification({
      to: dto.email,
      fullName: dto.fullName,
      token: emailVerificationToken,
    });

    return {
      user: this.toSafeUser(user),
    };
  }

  async login(
    dto: LoginDto,
  ): Promise<
    | { user: SafeUser; accessToken: string; refreshToken: string }
    | { requiresMfa: true; mfaToken: string }
  > {
    const tenantId = this.tenantContext.getTenantId()!;

    const user = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }

    if (user.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email before logging in.');
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // If MFA is enabled, return a temporary token instead of real tokens
    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, tenantId, type: 'mfa' },
        { expiresIn: '5m' },
      );
      return { requiresMfa: true, mfaToken };
    }

    const tokens = this.generateTokens(user, tenantId);

    await this.auditService.log({
      actorId: user.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'User',
      targetId: user.id,
    });

    return { user: this.toSafeUser(user), ...tokens };
  }

  async googleAuth(
    dto: GoogleAuthDto,
  ): Promise<
    | { user: SafeUser; accessToken: string; refreshToken: string }
    | { requiresMfa: true; mfaToken: string }
  > {
    if (!this.googleClientId || !this.googleClient) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    let payload:
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
        }
      | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const tenantId = this.tenantContext.getTenantId()!;
    const email = payload.email.toLowerCase();

    let user = await this.prisma.client.user.findFirst({
      where: {
        tenantId,
        OR: [
          { googleSub: payload.sub },
          { email: { equals: email, mode: 'insensitive' } },
        ],
      },
    });

    if (user?.googleSub && user.googleSub !== payload.sub) {
      throw new UnauthorizedException('Google account mismatch');
    }

    if (!user) {
      user = await this.prisma.client.user.create({
        data: {
          tenantId,
          email,
          googleSub: payload.sub,
          passwordHash: await bcrypt.hash(
            crypto.randomBytes(32).toString('hex'),
            BCRYPT_SALT_ROUNDS,
          ),
          fullName: this.encryption.encrypt(payload.name?.trim() || email),
          emailVerified: true,
        },
      });

      await this.auditService.log({
        actorId: user.id,
        action: AuditAction.USER_CREATED,
        targetType: 'User',
        targetId: user.id,
        details: { email: user.email, authProvider: 'google' },
      });
    } else if (!user.googleSub || !user.emailVerified) {
      user = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          googleSub: user.googleSub ?? payload.sub,
          emailVerified: true,
        },
      });
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }

    if (user.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Invalid Google credential');
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, tenantId, type: 'mfa' },
        { expiresIn: '5m' },
      );
      return { requiresMfa: true, mfaToken };
    }

    const tokens = this.generateTokens(user, tenantId);

    await this.auditService.log({
      actorId: user.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'User',
      targetId: user.id,
      details: { authProvider: 'google' },
    });

    return { user: this.toSafeUser(user), ...tokens };
  }

  async loginMfa(dto: MfaLoginDto): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    let payload: { sub: string; tenantId: string; type?: string };
    try {
      payload = this.jwtService.verify(dto.mfaToken!);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'mfa') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tenantId = this.tenantContext.getTenantId()!;
    if (payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Token does not belong to this platform');
    }

    // Must provide either a TOTP code or a recovery code (BE-016)
    if (!dto.code && !dto.recoveryCode) {
      throw new UnauthorizedException(
        'Either a TOTP code or a recovery code is required',
      );
    }

    let loginMethod: 'totp' | 'recovery';

    if (dto.recoveryCode) {
      // Recovery code path (BE-016)
      const valid = await this.mfaService.verifyRecoveryCode(
        payload.sub,
        dto.recoveryCode,
      );
      if (!valid) {
        throw new UnauthorizedException(
          'Invalid or already-used recovery code',
        );
      }
      loginMethod = 'recovery';
    } else {
      // Standard TOTP path
      const valid = await this.mfaService.verifyToken(payload.sub, dto.code!);
      if (!valid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
      loginMethod = 'totp';
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: payload.sub },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    const tokens = this.generateTokens(user, tenantId);

    await this.auditService.log({
      actorId: user.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'User',
      targetId: user.id,
      details: { mfa: true, method: loginMethod },
    });

    return { user: this.toSafeUser(user), ...tokens };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tenantId = this.tenantContext.getTenantId()!;

    let payload: { sub: string; tenantId: string; jti?: string; exp?: number };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Token does not belong to this platform');
    }

    // Check if the refresh token has been blacklisted (already used or revoked)
    if (payload.jti && (await this.isTokenBlacklisted(payload.jti))) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Blacklist the old refresh token so it cannot be reused (rotation)
    if (payload.jti && payload.exp) {
      const remainingTtl = payload.exp - Math.floor(Date.now() / 1000);
      if (remainingTtl > 0) {
        await this.blacklistToken(payload.jti, remainingTtl);
      }
    }

    return this.generateTokens(user, tenantId);
  }

  async logout(
    accessToken: string,
    refreshToken?: string,
  ): Promise<{ message: string }> {
    // Blacklist the access token
    await this.blacklistDecodedToken(accessToken);

    // Blacklist the refresh token if provided
    if (refreshToken) {
      await this.blacklistDecodedToken(refreshToken, this.refreshSecret);
    }

    return { message: 'Logged out successfully' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    let payload: { sub: string; tenantId: string; purpose: string };
    try {
      payload = this.jwtService.verify(dto.token);
    } catch {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    if (payload.purpose !== 'email-verification') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await this.emailService.sendWelcomeVerified({
      to: user.email,
      fullName: user.fullName,
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const tenantId = this.tenantContext.getTenantId()!;

    const user = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    // We return success even if user not found to prevent email enumeration
    if (!user) {
      return {
        message: 'If this email is registered, a new link has been sent.',
      };
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified.' };
    }

    const emailVerificationToken = this.jwtService.sign(
      { sub: user.id, tenantId, purpose: 'email-verification' },
      { expiresIn: '24h' },
    );

    await this.emailService.sendEmailVerification({
      to: user.email,
      fullName: user.fullName,
      token: emailVerificationToken,
    });

    return {
      message: 'If this email is registered, a new link has been sent.',
    };
  }
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const tenantId = this.tenantContext.getTenantId()!;

    const user = await this.prisma.client.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (user) {
      const resetJti = crypto.randomUUID();
      const resetToken = this.jwtService.sign(
        { sub: user.id, tenantId, purpose: 'password-reset', jti: resetJti },
        { expiresIn: '1h' },
      );

      this.logger.debug(`Password reset token generated for ${dto.email}`);

      await this.emailService.sendPasswordReset({
        to: user.email,
        fullName: user.fullName,
        token: resetToken,
      });
    }

    return {
      message: 'If this email is registered, you will receive a reset link.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    let payload: {
      sub: string;
      tenantId: string;
      purpose: string;
      jti?: string;
      exp?: number;
    };
    try {
      payload = this.jwtService.verify(dto.token);
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.purpose !== 'password-reset') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const tenantId = this.tenantContext.getTenantId()!;
    if (payload.tenantId !== tenantId) {
      throw new UnauthorizedException('Token does not belong to this platform');
    }

    if (payload.jti && (await this.isTokenBlacklisted(payload.jti))) {
      throw new UnauthorizedException('Reset token has been revoked');
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate reset token after use (prevents reuse within TTL)
    await this.blacklistDecodedToken(dto.token);

    await this.emailService.sendPasswordChanged({
      to: user.email,
      fullName: user.fullName,
    });

    return { message: 'Password reset successfully' };
  }

  // ─── Token Blacklisting ──────────────────────────────────────

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${jti}`);
    return result !== null;
  }

  private async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`blacklist:${jti}`, '1', ttlSeconds);
  }

  private async blacklistDecodedToken(
    token: string,
    secret?: string,
  ): Promise<void> {
    try {
      const decoded = this.jwtService.verify(token, {
        ...(secret ? { secret } : {}),
      });
      if (decoded.jti && decoded.exp) {
        const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingTtl > 0) {
          await this.blacklistToken(decoded.jti, remainingTtl);
        }
      }
    } catch {
      // Token already expired or invalid — no need to blacklist
    }
  }

  // ─── Token Generation ────────────────────────────────────────

  private generateTokens(
    user: User,
    tenantId: string,
  ): { accessToken: string; refreshToken: string } {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId,
        jti: accessJti,
      },
      { expiresIn: this.accessExpiry as any },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, tenantId, jti: refreshJti },
      { secret: this.refreshSecret, expiresIn: this.refreshExpiry as any },
    );

    return { accessToken, refreshToken };
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      fullName: this.encryption.decrypt(user.fullName),
      phone: user.phone ? this.encryption.decrypt(user.phone) : null,
      role: user.role,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
