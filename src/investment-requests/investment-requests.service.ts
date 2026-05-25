import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { CreateInvestmentRequestDto } from './dto/create-investment-request.dto.js';
import { QueryInvestmentRequestsDto } from './dto/query-investment-requests.dto.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';
import { RegistryEngineService } from '../transfer/registry-engine.service.js';
import { TokenAdapterService } from '../transfer/token-adapter.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const ACTIVE_STATUSES = ['REQUEST_CREATED', 'PENDING_PAYMENT_CONFIRMATION'];

const CONFIRMABLE_STATUSES = [
  'REQUEST_CREATED',
  'PENDING_PAYMENT_CONFIRMATION',
];

@Injectable()
export class InvestmentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly encryption: EncryptionService,
    private readonly registryEngine: RegistryEngineService,
    private readonly tokenAdapter: TokenAdapterService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Investor endpoints ──────────────────────────────────────────────────────

  async createRequest(dto: CreateInvestmentRequestDto, userId: string) {
    const tenantId = this.tenantContext.getTenantId()!;
    const config = this.tenantContext.getTenantConfig();
    const tenant = this.tenantContext.getTenant();

    // Verify opportunity exists and is LIVE
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: { id: dto.opportunityId, status: 'LIVE' },
    });
    if (!opportunity) {
      throw new NotFoundException(
        'Opportunity not found or not accepting requests',
      );
    }

    // Check no existing active request for this user + opportunity
    const existing = await this.prisma.client.investmentRequest.findFirst({
      where: {
        userId,
        opportunityId: dto.opportunityId,
        status: { in: ACTIVE_STATUSES },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an active request for this opportunity',
      );
    }

    // Validate amount against opportunity min/max
    if (
      opportunity.minimumAmount &&
      dto.amount < Number(opportunity.minimumAmount)
    ) {
      throw new BadRequestException(
        `Minimum investment amount is ${opportunity.currency} ${opportunity.minimumAmount}`,
      );
    }
    if (
      opportunity.maximumAmount &&
      dto.amount > Number(opportunity.maximumAmount)
    ) {
      throw new BadRequestException(
        `Maximum investment amount is ${opportunity.currency} ${opportunity.maximumAmount}`,
      );
    }

    // Validate acknowledgements
    const workflows = config?.workflows ?? {};
    const required: string[] = workflows.requiredAcknowledgements ?? [];
    if (required.length > 0) {
      const allAccepted = required.every((r: string) =>
        dto.acknowledgements.includes(r),
      );
      if (!allAccepted) {
        throw new BadRequestException('All acknowledgements must be accepted');
      }
    }

    const paymentConfig = this.getPaymentConfigOrThrow(config);

    // Generate reference number (retry on collision)
    const tenantSlug = (tenant?.slug ?? 'TENANT').toUpperCase();
    const year = new Date().getFullYear();
    const baseCount =
      (await this.prisma.client.investmentRequest.count({ where: {} })) + 1;

    // Calculate expiry
    const expiryDays = workflows.requestExpiryDays ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const { request, paymentInstruction } = await this.prisma.client.$transaction(
      async (tx: any) => {
        // Set defense-in-depth RLS context within this explicit transaction.
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        let req: any;
        for (let attempt = 0; attempt < 5; attempt++) {
          const seq = String(baseCount + attempt).padStart(6, '0');
          const referenceNumber = `${tenantSlug}-${year}-${seq}`;
          try {
            req = await tx.investmentRequest.create({
              data: {
                tenantId,
                userId,
                opportunityId: dto.opportunityId,
                amount: dto.amount,
                currency: opportunity.currency,
                status: 'REQUEST_CREATED',
                referenceNumber,
                acknowledgements: dto.acknowledgements,
                statusHistory: [
                  {
                    status: 'REQUEST_CREATED',
                    timestamp: new Date().toISOString(),
                  },
                ],
                expiresAt,
              },
            });
            break;
          } catch (err: any) {
            // Retry on reference collisions (DB unique constraint)
            const isUniqueViolation =
              typeof err?.code === 'string' && err.code === 'P2002';
            if (!isUniqueViolation || attempt === 4) throw err;
          }
        }

        const pi = await tx.paymentInstruction.create({
          data: {
            tenantId,
            investmentRequestId: req.id,
            receivingAccountName: this.encryption.encrypt(
              paymentConfig.accountName,
            ),
            receivingAccountIban: this.encryption.encrypt(paymentConfig.iban),
            receivingBankName: paymentConfig.bankName,
            receivingBankSwift: paymentConfig.swift,
            paymentReference: req.referenceNumber,
          },
        });

        return { request: req, paymentInstruction: pi };
      },
    );

    // Audit log
    await this.auditService.logTenantAction({
      actorId: userId,
      action: AuditAction.INVESTMENT_REQUEST_CREATED,
      targetType: 'InvestmentRequest',
      targetId: request.id,
      details: {
        opportunityId: dto.opportunityId,
        amount: dto.amount,
        currency: opportunity.currency,
        referenceNumber: request.referenceNumber,
      },
    });

    return {
      request: {
        id: request.id,
        referenceNumber: request.referenceNumber,
        status: request.status,
        amount: request.amount,
        currency: request.currency,
        expiresAt: request.expiresAt,
        createdAt: request.createdAt,
      },
      paymentInstruction: this.decryptPaymentInstruction(paymentInstruction),
    };
  }

  async getRequestDetail(requestId: string, userId: string) {
    const request = await this.prisma.client.investmentRequest.findFirst({
      where: { id: requestId, userId },
      include: {
        paymentInstruction: true,
        opportunity: {
          select: { title: true, assetClass: true, region: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Investment request not found');
    }

    return {
      id: request.id,
      referenceNumber: request.referenceNumber,
      status: request.status,
      amount: request.amount,
      currency: request.currency,
      acknowledgements: request.acknowledgements,
      statusHistory: request.statusHistory,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      opportunity: request.opportunity,
      paymentInstruction: request.paymentInstruction
        ? this.decryptPaymentInstruction(request.paymentInstruction)
        : null,
    };
  }

  async getUserRequests(
    userId: string,
    query?: { status?: string; page?: number; limit?: number },
  ) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query?.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.investmentRequest.findMany({
        where,
        include: {
          opportunity: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.investmentRequest.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        opportunityTitle: r.opportunity.title,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Admin endpoints ─────────────────────────────────────────────────────────

  async listAllRequests(query: QueryInvestmentRequestsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.opportunityId) {
      where.opportunityId = query.opportunityId;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.investmentRequest.findMany({
        where,
        include: {
          user: { select: { email: true, fullName: true } },
          opportunity: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.investmentRequest.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        referenceNumber: r.referenceNumber,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        user: r.user,
        opportunityTitle: r.opportunity.title,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminRequestDetail(requestId: string) {
    const request = await this.prisma.client.investmentRequest.findUnique({
      where: { id: requestId },
      include: {
        paymentInstruction: true,
        opportunity: {
          select: { title: true, assetClass: true, region: true },
        },
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Investment request not found');
    }

    return {
      id: request.id,
      referenceNumber: request.referenceNumber,
      status: request.status,
      amount: request.amount,
      currency: request.currency,
      acknowledgements: request.acknowledgements,
      statusHistory: request.statusHistory,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      user: request.user,
      opportunity: request.opportunity,
      paymentInstruction: request.paymentInstruction
        ? this.decryptPaymentInstruction(request.paymentInstruction)
        : null,
    };
  }

  async confirmRequest(requestId: string, actorId: string, reason?: string) {
    const { request, holding } = await this.prisma.client.$transaction(
      async (tx: any) => {
        // Lock the row for update to prevent TOCTOU race conditions (CR-001)
        await tx.$executeRaw`SELECT id FROM "investment_requests" WHERE "id" = ${requestId} FOR UPDATE`;

        const req = await tx.investmentRequest.findUnique({
          where: { id: requestId },
        });

        if (!req) {
          throw new NotFoundException('Investment request not found');
        }

        if (!CONFIRMABLE_STATUSES.includes(req.status)) {
          throw new BadRequestException(
            `Cannot confirm a request with status "${req.status}". Only ${CONFIRMABLE_STATUSES.join(
              ' or ',
            )} requests can be confirmed.`,
          );
        }

        // IR-05: Prevent confirmation of expired requests
        if (req.expiresAt && new Date(req.expiresAt) < new Date()) {
          throw new BadRequestException(
            `Cannot confirm request ${req.referenceNumber} because it expired on ${req.expiresAt.toISOString()}.`,
          );
        }

        const opportunity = tx.opportunity?.findUnique
          ? await tx.opportunity.findUnique({
              where: { id: req.opportunityId },
              select: { lockupUntil: true },
            })
          : null;

        const holding = await tx.holding.create({
          data: {
            tenantId: req.tenantId,
            userId: req.userId,
            opportunityId: req.opportunityId,
            investmentRequestId: req.id,
            units: req.amount, // MVP: units = amount
            acquisitionDate: new Date(),
            lockupUntil: opportunity?.lockupUntil ?? null,
            status: 'ACTIVE',
          },
        });

        await this.registryEngine.sealPrimaryIssuance({
          tenantId: req.tenantId,
          opportunityId: req.opportunityId,
          toUserId: req.userId,
          quantity: Number(req.amount),
          holdingId: holding.id,
          actorId,
          tx,
        });

        const history = Array.isArray(req.statusHistory)
          ? [...(req.statusHistory as any[])]
          : [];
        history.push({
          status: 'CONFIRMED',
          timestamp: new Date().toISOString(),
          actorId,
          reason: reason ?? undefined,
        });

        const updated = await tx.investmentRequest.update({
          where: { id: requestId },
          data: { status: 'CONFIRMED', statusHistory: history },
        });

        return { request: updated, holding };
      },
    );

    // Mirror to token record (fire-and-forget, but do not swallow silently)
    this.tokenAdapter
      .mirrorPrimaryIssuance({
        tenantId: request.tenantId,
        holdingId: holding.id,
        toUserId: request.userId,
        quantity: Number(request.amount),
      })
      .catch(() => {});

    // Audit log
    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.INVESTMENT_REQUEST_CONFIRMED,
      targetType: 'InvestmentRequest',
      targetId: requestId,
      details: {
        referenceNumber: request.referenceNumber,
        amount: request.amount,
        currency: request.currency,
        holdingId: holding.id,
        reason,
      },
    });

    await this.notifications.create(
      request.tenantId,
      request.userId,
      'SYSTEM',
      'Investment Request Confirmed',
      `Your investment request ${request.referenceNumber} has been confirmed.`,
    );

    return {
      request: {
        id: request.id,
        referenceNumber: request.referenceNumber,
        status: request.status,
        amount: request.amount,
        currency: request.currency,
      },
      holding: {
        id: holding.id,
        units: holding.units,
        acquisitionDate: holding.acquisitionDate,
        status: holding.status,
      },
    };
  }

  async failRequest(requestId: string, actorId: string, reason?: string) {
    const updated = await this.prisma.client.$transaction(async (tx: any) => {
      // Lock the row for update to prevent TOCTOU race conditions
      await tx.$executeRaw`SELECT id FROM "investment_requests" WHERE "id" = ${requestId} FOR UPDATE`;

      const request = await tx.investmentRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw new NotFoundException('Investment request not found');
      }

      if (!CONFIRMABLE_STATUSES.includes(request.status)) {
        throw new BadRequestException(
          `Cannot fail a request with status "${request.status}"`,
        );
      }

      const history = Array.isArray(request.statusHistory)
        ? [...(request.statusHistory as any[])]
        : [];
      history.push({
        status: 'FAILED',
        timestamp: new Date().toISOString(),
        actorId,
        reason: reason ?? undefined,
      });

      return tx.investmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'FAILED',
          statusHistory: history,
        },
      });
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.INVESTMENT_REQUEST_FAILED,
      targetType: 'InvestmentRequest',
      targetId: requestId,
      details: {
        referenceNumber: updated.referenceNumber,
        reason,
      },
    });

    await this.notifications.create(
      updated.tenantId,
      updated.userId,
      'SYSTEM',
      'Investment Request Failed',
      `Your investment request ${updated.referenceNumber} was marked as failed.`,
    );

    return {
      id: updated.id,
      referenceNumber: updated.referenceNumber,
      status: updated.status,
      amount: updated.amount,
      currency: updated.currency,
    };
  }

  async expireRequests() {
    const now = new Date();

    const stale = await this.prisma.client.investmentRequest.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        expiresAt: { lt: now },
      },
    });

    let count = 0;
    for (const request of stale) {
      const history = Array.isArray(request.statusHistory)
        ? [...(request.statusHistory as any[])]
        : [];
      history.push({
        status: 'EXPIRED',
        timestamp: now.toISOString(),
        reason: 'Request expired',
      });

      await this.prisma.client.investmentRequest.update({
        where: { id: request.id },
        data: {
          status: 'EXPIRED',
          statusHistory: history,
        },
      });

      await this.auditService.log({
        tenantId: request.tenantId,
        actorId: null,
        action: AuditAction.INVESTMENT_REQUEST_EXPIRED,
        targetType: 'InvestmentRequest',
        targetId: request.id,
        details: { referenceNumber: request.referenceNumber },
      });

      count++;
    }

    return { expired: count };
  }

  private decryptPaymentInstruction(pi: any) {
    return {
      receivingAccountName: this.encryption.decrypt(pi.receivingAccountName),
      receivingAccountIban: this.encryption.decrypt(pi.receivingAccountIban),
      receivingBankName: pi.receivingBankName,
      receivingBankSwift: pi.receivingBankSwift,
      paymentReference: pi.paymentReference,
    };
  }

  private getPaymentConfigOrThrow(config: any) {
    const paymentConfig = config?.integrations?.paymentConfig;
    if (!paymentConfig || typeof paymentConfig !== 'object') {
      throw new InternalServerErrorException(
        'Tenant payment configuration is missing',
      );
    }

    const requiredFields = ['accountName', 'iban', 'bankName', 'swift'];
    for (const field of requiredFields) {
      if (
        !paymentConfig[field] ||
        typeof paymentConfig[field] !== 'string' ||
        !paymentConfig[field].trim()
      ) {
        throw new InternalServerErrorException(
          `Tenant payment configuration is incomplete: ${field} is not configured`,
        );
      }
    }

    return {
      accountName: paymentConfig.accountName.trim(),
      iban: paymentConfig.iban.trim(),
      bankName: paymentConfig.bankName.trim(),
      swift: paymentConfig.swift.trim(),
    };
  }
}
