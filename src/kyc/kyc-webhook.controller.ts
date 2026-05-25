import {
  Controller,
  Post,
  Param,
  Req,
  Logger,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';
import { KycProviderFactory } from './kyc-provider.factory.js';
import type {
  KycProviderConfig,
  RequestWithRawBody,
} from './interfaces/kyc-provider.interface.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';

@ApiExcludeController()
@Controller('webhooks/kyc')
@Public()
export class KycWebhookController {
  private readonly logger = new Logger(KycWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly providerFactory: KycProviderFactory,
    private readonly encryption: EncryptionService,
  ) {}

  @Post(':tenantSlug')
  @HttpCode(200)
  async handleWebhook(
    @Param('tenantSlug') tenantSlug: string,
    @Req() req: RequestWithRawBody,
  ) {
    // 1. Resolve tenant by slug (bypassing tenant scoping)
    const tenant = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.tenant.findFirst({
        where: { slug: tenantSlug },
        select: { id: true, name: true, slug: true },
      });
    });

    if (!tenant) {
      this.logger.warn(`Webhook for unknown tenant slug: ${tenantSlug}`);
      throw new BadRequestException('Unknown tenant');
    }

    // 2. Load tenant KYC config
    const config = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.tenantConfig.findUnique({
        where: { tenantId: tenant.id },
        select: { integrations: true },
      });
    });

    const rawIntegrations = config?.integrations ?? {};
    const integrations =
      typeof rawIntegrations === 'string'
        ? this.encryption.decryptJson<Record<string, any>>(rawIntegrations)
        : (rawIntegrations as Record<string, any>);
    const providerName: string = integrations.kycProvider ?? 'sumsub';
    const kycConfig = integrations.kycConfig as KycProviderConfig | undefined;

    if (!kycConfig?.apiKey || !kycConfig?.apiSecret) {
      this.logger.warn(`KYC provider not configured for tenant ${tenantSlug}`);
      throw new BadRequestException(
        'KYC provider not configured for this tenant',
      );
    }

    // 3. Parse and verify webhook
    const provider = this.providerFactory.getProvider(providerName);
    const headers = req.headers as Record<
      string,
      string | string[] | undefined
    >;
    const result = await provider.parseWebhook({
      headers,
      body: req.body,
      rawBody: req.rawBody?.toString('utf8'),
      tenantConfig: kycConfig,
    });

    if (!result) {
      this.logger.warn(
        `Invalid webhook payload/signature for tenant ${tenantSlug}`,
      );
      throw new BadRequestException('Invalid webhook signature or payload');
    }

    this.logger.log(
      `KYC webhook for tenant ${tenantSlug}: providerRef=${result.providerRef}, status=${result.status}`,
    );

    // 4. Find verification record by providerRef
    const verification = await this.prisma.bypassTenantScoping(async () => {
      const byProviderRef = await this.prisma.client.verification.findFirst({
        where: {
          tenantId: tenant.id,
          providerRef: result.providerRef,
        },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      });

      if (byProviderRef) {
        return byProviderRef;
      }

      if (!result.externalUserId) {
        return null;
      }

      return await this.prisma.client.verification.findFirst({
        where: {
          tenantId: tenant.id,
          userId: result.externalUserId,
          provider: providerName,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      });
    });

    if (!verification) {
      this.logger.warn(
        `No verification found for providerRef: ${result.providerRef}`,
      );
      return { ok: true, message: 'No matching verification' };
    }

    // Skip if already in a terminal state
    if (
      verification.status === 'APPROVED' ||
      verification.status === 'REJECTED'
    ) {
      this.logger.log(
        `Verification ${verification.id} already ${verification.status}, skipping`,
      );
      return { ok: true, message: 'Already processed' };
    }

    // 5. Update verification and user based on result
    await this.prisma.bypassTenantScoping(async () => {
      if (result.status === 'APPROVED') {
        await this.prisma.client.verification.update({
          where: { id: verification.id },
          data: {
            providerRef: result.providerRef,
            status: 'APPROVED',
            eligibilityStatus: 'ELIGIBLE',
            providerData: this.encryption.encryptJson(result.rawData),
          },
        });

        // Upgrade user role to VERIFIED
        await this.prisma.client.user.update({
          where: { id: verification.userId },
          data: { role: 'VERIFIED' },
        });

        await this.audit.log({
          tenantId: tenant.id,
          actorId: null,
          action: AuditAction.KYC_APPROVED,
          targetType: 'Verification',
          targetId: verification.id,
          details: {
            userId: verification.userId,
            source: 'provider_webhook',
            providerRef: result.providerRef,
          },
        });

        await this.emailService.sendKycApproved({
          to: verification.user.email,
          fullName: verification.user.fullName,
        });
      } else if (result.status === 'REJECTED') {
        await this.prisma.client.verification.update({
          where: { id: verification.id },
          data: {
            providerRef: result.providerRef,
            status: 'REJECTED',
            eligibilityStatus: 'NOT_ELIGIBLE',
            rejectionReason: result.rejectionReason ?? 'Rejected by provider',
            providerData: this.encryption.encryptJson(result.rawData),
          },
        });

        await this.audit.log({
          tenantId: tenant.id,
          actorId: null,
          action: AuditAction.KYC_REJECTED,
          targetType: 'Verification',
          targetId: verification.id,
          details: {
            userId: verification.userId,
            source: 'provider_webhook',
            providerRef: result.providerRef,
            reason: result.rejectionReason,
          },
        });

        await this.emailService.sendKycRejected({
          to: verification.user.email,
          fullName: verification.user.fullName,
          reason: result.rejectionReason ?? 'Rejected by provider',
        });
      } else {
        // PENDING_REVIEW — just update providerData
        await this.prisma.client.verification.update({
          where: { id: verification.id },
          data: {
            providerRef: result.providerRef,
            providerData: this.encryption.encryptJson(result.rawData),
          },
        });
      }
    });

    return { ok: true };
  }
}
