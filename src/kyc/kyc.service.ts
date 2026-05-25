import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { KycProviderFactory } from './kyc-provider.factory.js';
import type { KycProviderConfig } from './interfaces/kyc-provider.interface.js';
import { QueryKycQueueDto } from './dto/query-kyc-queue.dto.js';
import { KycRejectDto } from './dto/kyc-reject.dto.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly providerFactory: KycProviderFactory,
    private readonly encryption: EncryptionService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Investor Methods ────────────────────────────────────────────────────────

  async getVerificationStatus(userId: string) {
    const verification = await this.prisma.client.verification.findFirst({
      where: { userId },
    });

    if (!verification) {
      return {
        status: 'NOT_STARTED',
        eligibilityStatus: 'PENDING',
        jurisdiction: null,
        rejectionReason: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      id: verification.id,
      status: verification.status,
      eligibilityStatus: verification.eligibilityStatus,
      jurisdiction: verification.jurisdiction,
      rejectionReason: verification.rejectionReason,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }

  async initiateVerification(userId: string) {
    const tenantId = this.tenantContext.getTenantId()!;
    const config = this.tenantContext.getTenantConfig();
    const integrations = config?.integrations ?? {};
    const providerName: string = integrations.kycProvider ?? 'sumsub';
    const kycConfig = integrations.kycConfig as KycProviderConfig | undefined;

    const existing = await this.prisma.client.verification.findFirst({
      where: { userId },
    });

    if (existing) {
      if (existing.status === 'APPROVED') {
        throw new BadRequestException('Already verified');
      }
      if (
        existing.status === 'IN_PROGRESS' ||
        existing.status === 'PENDING_REVIEW'
      ) {
        throw new BadRequestException('Verification already in progress');
      }
    }

    // Load user details for provider session
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, phone: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If KYC provider credentials are configured, use real provider
    if (kycConfig?.apiKey && kycConfig?.apiSecret) {
      const provider = this.providerFactory.getProvider(providerName);
      const previousState = existing
        ? {
            status: existing.status,
            provider: existing.provider,
            providerRef: existing.providerRef,
            rejectionReason: existing.rejectionReason,
            reviewedBy: existing.reviewedBy,
            reviewedAt: existing.reviewedAt,
          }
        : null;

      const verification = existing
        ? await this.prisma.client.verification.update({
            where: { id: existing.id },
            data: {
              status: 'IN_PROGRESS',
              provider: providerName,
              providerRef: null,
              rejectionReason: null,
              reviewedBy: null,
              reviewedAt: null,
            },
          })
        : await this.prisma.client.verification.create({
            data: {
              tenantId,
              userId,
              provider: providerName,
              status: 'IN_PROGRESS',
            },
          });

      try {
        const session = await provider.createSession({
          externalUserId: userId,
          email: user.email,
          phone: user.phone,
          fullName: user.fullName,
          tenantConfig: kycConfig,
        });

        await this.prisma.client.verification.update({
          where: { id: verification.id },
          data: {
            providerRef: session.providerRef,
          },
        });

        this.logger.log(
          `KYC session created for user ${userId} via ${providerName}`,
        );

        if (providerName === 'sumsub') {
          return {
            provider: 'SUMSUB',
            status: 'IN_PROGRESS',
            sumsub: {
              accessToken: session.sdkAccessToken,
              refreshUrl: '/users/me/verification/sumsub/refresh',
              email: user.email,
              phone: user.phone,
              lang: 'en',
            },
          };
        }

        return {
          status: 'IN_PROGRESS',
          provider: providerName.toUpperCase(),
          message: 'KYC session created — complete verification with provider',
        };
      } catch (error: any) {
        if (existing && previousState) {
          await this.prisma.client.verification.update({
            where: { id: verification.id },
            data: previousState,
          });
        } else {
          await this.prisma.client.verification.delete({
            where: { id: verification.id },
          });
        }

        this.logger.error(
          `KYC provider error for user ${userId}: ${error.message}`,
        );
        throw new BadRequestException(`KYC provider error: ${error.message}`);
      }
    }

    // Fallback: no provider credentials — use manual review flow
    this.logger.log(
      `No KYC credentials for tenant ${tenantId}, using manual review flow`,
    );

    if (existing) {
      await this.prisma.client.verification.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING_REVIEW',
          provider: providerName,
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      });
    } else {
      await this.prisma.client.verification.create({
        data: {
          tenantId,
          userId,
          provider: providerName,
          status: 'PENDING_REVIEW',
        },
      });
    }

    return {
      provider: providerName.toUpperCase(),
      status: 'PENDING_REVIEW',
      message: 'Verification submitted for review',
    };
  }

  async refreshSumsubSession(userId: string) {
    const config = this.tenantContext.getTenantConfig();
    const integrations = config?.integrations ?? {};
    const providerName: string = integrations.kycProvider ?? 'sumsub';
    const kycConfig = integrations.kycConfig as KycProviderConfig | undefined;

    if (providerName !== 'sumsub') {
      throw new BadRequestException(
        `KYC provider "${providerName}" does not support Sumsub refresh`,
      );
    }

    if (!kycConfig?.apiKey || !kycConfig?.apiSecret) {
      throw new BadRequestException('Sumsub provider is not configured');
    }

    const verification = await this.prisma.client.verification.findFirst({
      where: { userId },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    if (verification.provider !== 'sumsub') {
      throw new BadRequestException('Verification is not using Sumsub');
    }

    if (
      verification.status !== 'IN_PROGRESS' &&
      verification.status !== 'PENDING_REVIEW'
    ) {
      throw new BadRequestException(
        `Cannot refresh Sumsub session with status "${verification.status}"`,
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const provider = this.providerFactory.getProvider(providerName);
    if (!provider.refreshSessionToken) {
      throw new BadRequestException(
        `KYC provider "${providerName}" does not support session refresh`,
      );
    }

    try {
      const session = await provider.refreshSessionToken({
        externalUserId: userId,
        tenantConfig: kycConfig,
      });

      return {
        provider: 'SUMSUB',
        status: 'IN_PROGRESS',
        sumsub: {
          accessToken: session.accessToken,
          refreshUrl: '/users/me/verification/sumsub/refresh',
          email: user.email,
          phone: user.phone,
          lang: 'en',
        },
      };
    } catch (error: any) {
      this.logger.error(
        `KYC provider refresh error for user ${userId}: ${error.message}`,
      );
      throw new BadRequestException(`KYC provider error: ${error.message}`);
    }
  }

  // ─── Admin Methods ───────────────────────────────────────────────────────────

  async listKycQueue(query: QueryKycQueueDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = 'PENDING_REVIEW';
    }

    if (query.search) {
      where.user = {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.verification.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.verification.count({ where }),
    ]);

    return {
      data: data.map((v) => ({
        id: v.id,
        status: v.status,
        eligibilityStatus: v.eligibilityStatus,
        provider: v.provider,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        user: v.user,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getKycDetail(verificationId: string) {
    const verification = await this.prisma.client.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            createdAt: true,
          },
        },
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    return {
      id: verification.id,
      status: verification.status,
      eligibilityStatus: verification.eligibilityStatus,
      provider: verification.provider,
      providerRef: verification.providerRef,
      jurisdiction: verification.jurisdiction,
      providerData: verification.providerData
        ? this.encryption.decryptJson(verification.providerData)
        : null,
      rejectionReason: verification.rejectionReason,
      reviewedBy: verification.reviewedBy,
      reviewedAt: verification.reviewedAt,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
      user: verification.user,
    };
  }

  async approveKyc(verificationId: string, actorId: string) {
    const verification = await this.prisma.client.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    if (
      verification.status !== 'PENDING_REVIEW' &&
      verification.status !== 'IN_PROGRESS'
    ) {
      throw new BadRequestException(
        `Cannot approve verification with status "${verification.status}"`,
      );
    }

    const updated = await this.prisma.client.verification.update({
      where: { id: verificationId },
      data: {
        status: 'APPROVED',
        eligibilityStatus: 'ELIGIBLE',
        reviewedBy: actorId,
        reviewedAt: new Date(),
      },
    });

    // Upgrade user role to VERIFIED
    await this.prisma.client.user.update({
      where: { id: verification.userId },
      data: { role: 'VERIFIED' },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.KYC_APPROVED,
      targetType: 'Verification',
      targetId: verificationId,
      details: { userId: verification.userId },
    });

    await this.emailService.sendKycApproved({
      to: verification.user.email,
      fullName: verification.user.fullName,
    });

    await this.notifications.create(
      verification.tenantId,
      verification.userId,
      'COMPLIANCE',
      'KYC Approved',
      'Your KYC verification has been reviewed and approved. Your account is fully verified.',
    );

    return {
      id: updated.id,
      status: updated.status,
      eligibilityStatus: updated.eligibilityStatus,
      reviewedAt: updated.reviewedAt,
    };
  }

  async rejectKyc(verificationId: string, dto: KycRejectDto, actorId: string) {
    const verification = await this.prisma.client.verification.findUnique({
      where: { id: verificationId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    if (
      verification.status !== 'PENDING_REVIEW' &&
      verification.status !== 'IN_PROGRESS'
    ) {
      throw new BadRequestException(
        `Cannot reject verification with status "${verification.status}"`,
      );
    }

    const updated = await this.prisma.client.verification.update({
      where: { id: verificationId },
      data: {
        status: 'REJECTED',
        eligibilityStatus: 'NOT_ELIGIBLE',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.KYC_REJECTED,
      targetType: 'Verification',
      targetId: verificationId,
      details: { userId: verification.userId, reason: dto.reason },
    });

    await this.emailService.sendKycRejected({
      to: verification.user.email,
      fullName: verification.user.fullName,
      reason: dto.reason,
    });

    await this.notifications.create(
      verification.tenantId,
      verification.userId,
      'COMPLIANCE',
      'KYC Rejected',
      `Your KYC verification was rejected. Reason: ${dto.reason}`,
    );

    return {
      id: updated.id,
      status: updated.status,
      eligibilityStatus: updated.eligibilityStatus,
      rejectionReason: updated.rejectionReason,
      reviewedAt: updated.reviewedAt,
    };
  }
}
