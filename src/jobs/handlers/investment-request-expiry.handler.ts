import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditAction } from '../../audit/audit-action.enum.js';
import { EmailService } from '../../notifications/email.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { SYSTEM_JOB_IDS, JOB_NAMES } from '../jobs.constants.js';

const ACTIVE_STATUSES = ['REQUEST_CREATED', 'PENDING_PAYMENT_CONFIRMATION'];
const BATCH_SIZE = 50;

@Injectable()
export class InvestmentRequestExpiryHandler {
  private readonly logger = new Logger(InvestmentRequestExpiryHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<{ expired: number; errors: number }> {
    const lockKey = 'lock:job:investment-request-expiry';
    const lockTtl = 240; // 4 minutes

    const acquired = await this.redis.acquireLock(lockKey, lockTtl);
    if (!acquired) {
      this.logger.warn('Expiry job already in progress, skipping...');
      return { expired: 0, errors: 0 };
    }

    try {
      return await this.prisma.bypassTenantScoping(async () => {
        const now = new Date();
        let expired = 0;
        let errors = 0;

        // Global cache for this run to avoid redundant DB calls across batches
        const tenantMap = new Map<
          string,
          {
            tenantName: string;
            accentColor: string;
            domain: string;
            fromName: string;
            fromAddress: string | null;
          }
        >();

        while (true) {
          const batch = await this.prisma.client.investmentRequest.findMany({
            where: {
              status: { in: ACTIVE_STATUSES },
              expiresAt: { lt: now },
            },
            include: {
              user: { select: { email: true, fullName: true } },
              opportunity: { select: { title: true } },
            },
            take: BATCH_SIZE,
            orderBy: { expiresAt: 'asc' },
          });

          if (batch.length === 0) break;

          // Collect unique tenantIds in this batch that aren't in our cache yet
          const unknownTenantIds = Array.from(
            new Set<string>(
              batch
                .map((r: any) => r.tenantId)
                .filter((tid: string) => !tenantMap.has(tid)),
            ),
          );

          for (const tid of unknownTenantIds) {
            try {
              const tenant = await this.prisma.client.tenant.findUnique({
                where: { id: tid },
                select: { name: true, domain: true },
              });
              const config = await this.prisma.client.tenantConfig.findUnique({
                where: { tenantId: tid },
                select: { branding: true, email: true },
              });
              const branding =
                config?.branding && typeof config.branding === 'object'
                  ? (config.branding as Record<string, any>)
                  : {};
              const emailCfg =
                config?.email && typeof config.email === 'object'
                  ? (config.email as Record<string, any>)
                  : {};
              tenantMap.set(tid, {
                tenantName: tenant?.name ?? 'OpenReal',
                accentColor:
                  branding.accentColor || branding.accent || '#4F7BF7',
                domain: tenant?.domain ?? 'localhost',
                fromName: emailCfg.fromName ?? tenant?.name ?? 'OpenReal',
                fromAddress: emailCfg.fromAddress ?? null,
              });
            } catch {
              tenantMap.set(tid, {
                tenantName: 'OpenReal',
                accentColor: '#4F7BF7',
                domain: 'localhost',
                fromName: 'OpenReal',
                fromAddress: null,
              });
            }
          }

          const MAX_RETRIES = 3;
          for (const request of batch) {
            let attempts = 0;
            let success = false;

            while (attempts < MAX_RETRIES && !success) {
              attempts++;
              try {
                const history = Array.isArray(request.statusHistory)
                  ? [...(request.statusHistory as any[])]
                  : [];
                history.push({
                  status: 'EXPIRED',
                  timestamp: now.toISOString(),
                  reason:
                    attempts > 1
                      ? `Auto-expired by system (retry attempt ${attempts})`
                      : 'Auto-expired by system',
                });

                await this.prisma.client.investmentRequest.update({
                  where: { id: request.id },
                  data: {
                    status: 'EXPIRED',
                    statusHistory: history,
                  },
                });

                await this.audit.log({
                  tenantId: request.tenantId,
                  actorId: null,
                  action: AuditAction.INVESTMENT_REQUEST_EXPIRED,
                  targetType: 'InvestmentRequest',
                  targetId: request.id,
                  details: {
                    referenceNumber: request.referenceNumber,
                    reason: 'Auto-expired by scheduled job',
                    attempts,
                  },
                });

                const branding = tenantMap.get(request.tenantId);
                if (branding && request.user?.email) {
                  await this.emailService.sendInvestmentRequestExpired({
                    to: request.user.email,
                    fullName: request.user.fullName,
                    referenceNumber: request.referenceNumber,
                    opportunityTitle: request.opportunity?.title ?? 'Unknown',
                    amount: Number(request.amount),
                    currency: request.currency,
                    expiryDate: request.expiresAt as Date,
                    branding,
                  });

                  await this.notifications.create(
                    request.tenantId,
                    request.userId,
                    'SYSTEM',
                    'Investment Request Expired',
                    `Your investment request for ${request.opportunity?.title ?? 'Unknown'} has expired because the payment timeframe elapsed.`,
                  );
                } else {
                  this.logger.warn(
                    `Missing email for user ${request.userId} on request ${request.id}. Notification skipped.`,
                  );
                  errors++;
                }

                success = true;
                expired++;
              } catch (error: any) {
                if (attempts < MAX_RETRIES) {
                  this.logger.warn(
                    `Retry ${attempts}/${MAX_RETRIES} for request ${request.id}: ${error.message}`,
                  );
                  await new Promise((resolve) => setTimeout(resolve, 100));
                } else {
                  this.logger.error(
                    `Failed to expire request ${request.id} after ${MAX_RETRIES} attempts: ${error.message}`,
                  );
                  errors++;
                }
              }
            }
          }

          // If we got fewer than BATCH_SIZE, we've processed everything
          if (batch.length < BATCH_SIZE) break;
        }

        this.logger.log(
          `Expiry job complete: ${expired} expired, ${errors} errors`,
        );

        // Persist the summary to audit logs (BE-006)
        await this.audit.log({
          tenantId: null, // Platform level
          actorId: null, // System account
          action: AuditAction.SYSTEM_JOB_SUMMARY,
          targetType: 'SystemJob',
          targetId: SYSTEM_JOB_IDS.INVESTMENT_REQUEST_EXPIRY,
          details: {
            jobName: JOB_NAMES.INVESTMENT_REQUEST_EXPIRY_CHECK,
            expiredCount: expired,
            errorCount: errors,
            timestamp: now.toISOString(),
          },
        });

        return { expired, errors };
      });
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }
}
