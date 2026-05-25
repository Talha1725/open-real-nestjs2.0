import { User, BankDetails } from "@prisma/client";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { MfaActionDto } from './dto/update-mfa.dto.js';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto.js';
import { SafeUser } from '../common/interfaces/safe-user.interface.js';
import { BankDetailsResponse } from '../common/interfaces/bank-details-response.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';
import { KycService } from '../kyc/kyc.service.js';
import { MfaService } from '../auth/mfa.service.js';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly encryption: EncryptionService,
    private readonly kycService: KycService,
    private readonly mfaService: MfaService,
  ) {}

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toSafeUser(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<SafeUser> {
    const data: Record<string, any> = {};
    if (dto.fullName !== undefined) data.fullName = this.encryption.encrypt(dto.fullName);
    if (dto.phone !== undefined) data.phone = this.encryption.encrypt(dto.phone ?? '');

    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data,
    });

    return this.toSafeUser(user);
  }

  async getVerificationStatus(userId: string) {
    return this.kycService.getVerificationStatus(userId);
  }

  async initiateVerification(userId: string) {
    return this.kycService.initiateVerification(userId);
  }

  async refreshSumsubVerification(userId: string) {
    return this.kycService.refreshSumsubSession(userId);
  }

  async getBankDetails(userId: string): Promise<BankDetailsResponse | null> {
    const bankDetails = await this.prisma.client.bankDetails.findFirst({
      where: { userId },
    });

    if (!bankDetails) {
      return null;
    }

    return this.toBankDetailsResponse(bankDetails);
  }

  async updateBankDetails(
    userId: string,
    dto: UpdateBankDetailsDto,
  ): Promise<BankDetailsResponse> {
    const tenantId = this.tenantContext.getTenantId()!;

    const bankDetails = await this.prisma.client.bankDetails.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        accountHolderName: this.encryption.encrypt(dto.accountHolderName),
        iban: this.encryptOptional(dto.iban),
        accountNumber: this.encryptOptional(dto.accountNumber),
        bankName: dto.bankName,
        swiftBic: this.encryptOptional(dto.swiftBic),
        sortCode: this.encryptOptional(dto.sortCode),
        currency: dto.currency ?? 'USD',
      },
      update: {
        accountHolderName: this.encryption.encrypt(dto.accountHolderName),
        iban: this.encryptOptional(dto.iban),
        accountNumber: this.encryptOptional(dto.accountNumber),
        bankName: dto.bankName,
        swiftBic: this.encryptOptional(dto.swiftBic),
        sortCode: this.encryptOptional(dto.sortCode),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });

    return this.toBankDetailsResponse(bankDetails);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.auditService.log({
      actorId: userId,
      action: AuditAction.PASSWORD_CHANGED,
      targetType: 'User',
      targetId: userId,
    });

    await this.emailService.sendPasswordChanged({
      to: user.email,
      fullName: user.fullName,
    });

    return { message: 'Password changed successfully' };
  }

  async handleMfaAction(userId: string, dto: MfaActionDto) {
    if (dto.action === 'setup') {
      return this.mfaService.generateSecret(userId);
    }

    if (dto.action === 'enable') {
      if (!dto.secret || !dto.code) {
        throw new BadRequestException(
          'secret and code are required to enable MFA',
        );
      }
      await this.mfaService.enableMfa(userId, dto.secret, dto.code);

      await this.auditService.log({
        actorId: userId,
        action: AuditAction.MFA_TOGGLED,
        targetType: 'User',
        targetId: userId,
        details: { enabled: true },
      });

      return { message: 'MFA enabled', mfaEnabled: true };
    }

    // disable
    if (!dto.code) {
      throw new BadRequestException('code is required to disable MFA');
    }
    await this.mfaService.disableMfa(userId, dto.code);

    await this.auditService.log({
      actorId: userId,
      action: AuditAction.MFA_TOGGLED,
      targetType: 'User',
      targetId: userId,
      details: { enabled: false },
    });

    return { message: 'MFA disabled', mfaEnabled: false };
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      fullName: this.encryption.decrypt(user.fullName),
      phone: this.decryptOptional(user.phone),
      role: user.role,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toBankDetailsResponse(bankDetails: BankDetails): BankDetailsResponse {
    return {
      id: bankDetails.id,
      accountHolderName: bankDetails.accountHolderName,
      iban: this.decryptOptional(bankDetails.iban),
      accountNumber: this.decryptOptional(bankDetails.accountNumber),
      bankName: bankDetails.bankName,
      swiftBic: this.decryptOptional(bankDetails.swiftBic),
      sortCode: bankDetails.sortCode,
      currency: bankDetails.currency,
      createdAt: bankDetails.createdAt,
      updatedAt: bankDetails.updatedAt,
    };
  }

  private encryptOptional(value: string | null | undefined): string | null {
    if (value === undefined || value === null || value === '') {
      return value ?? null;
    }
    return this.encryption.encrypt(value);
  }

  private decryptOptional(value: string | null | undefined): string | null {
    if (value === undefined || value === null || value === '') {
      return value ?? null;
    }
    return this.encryption.decrypt(value);
  }
}
