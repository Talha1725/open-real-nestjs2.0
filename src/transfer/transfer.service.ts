import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { JobsService } from '../jobs/jobs.service.js';
import { JOB_NAMES } from '../jobs/jobs.constants.js';
import { RulesEngineService } from './rules-engine.service.js';
import { RegistryEngineService } from './registry-engine.service.js';
import { TokenAdapterService } from './token-adapter.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  CreateTransferRequestDto,
  TransferInitiationTypeDto,
} from './dto/create-transfer-request.dto.js';
import { QueryTransfersDto } from './dto/query-transfers.dto.js';

const TERMINAL_STATUSES = [
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['RULES_CHECK', 'CANCELLED'],
  RULES_CHECK: ['MANAGER_REVIEW', 'CANCELLED'],
  MANAGER_REVIEW: ['PRIORITY_WINDOW', 'KYC_READY', 'REJECTED', 'CANCELLED'],
  PRIORITY_WINDOW: [
    'KYC_READY',
    'BUYER_SELECTED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  KYC_READY: ['BUYER_SELECTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  BUYER_SELECTED: [
    'COMPLIANCE_REVIEW',
    'BUYER_VERIFICATION_PENDING',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  BUYER_VERIFICATION_PENDING: [
    'COMPLIANCE_REVIEW',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  COMPLIANCE_REVIEW: [
    'DOCS_PENDING',
    'BUYER_VERIFICATION_PENDING',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  DOCS_PENDING: ['PAYMENT_PENDING', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  PAYMENT_PENDING: ['PAYMENT_CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  PAYMENT_CONFIRMED: [
    'FINALIZING',
    'REGISTER_UPDATE_IN_PROGRESS',
    'REJECTED',
    'CANCELLED',
  ],
  FINALIZING: ['COMPLETED', 'ESCALATED', 'CANCELLED'],
  REGISTER_UPDATE_IN_PROGRESS: ['COMPLETED', 'ESCALATED', 'CANCELLED'],
  ESCALATED: [
    'FINALIZING',
    'REGISTER_UPDATE_IN_PROGRESS',
    'REJECTED',
    'CANCELLED',
  ],
};

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly jobsService: JobsService,
    private readonly rulesEngine: RulesEngineService,
    private readonly registryEngine: RegistryEngineService,
    private readonly tokenAdapter: TokenAdapterService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async loadCase(id: string, tx?: any) {
    const client = tx ?? this.prisma.client;
    const tc = await client.transferCase.findUnique({
      where: { id },
    });
    if (!tc) throw new NotFoundException('Transfer case not found');
    return tc;
  }

  private async lockCase(id: string, tx?: any) {
    const client = tx ?? this.prisma.client;
    await client.$executeRaw`SELECT id FROM "transfer_cases" WHERE "id" = ${id} FOR UPDATE`;
    const tc = await client.transferCase.findUnique({
      where: { id },
    });
    if (!tc) throw new NotFoundException('Transfer case not found');
    return tc;
  }

  private async assertIssuerAccess(
    transferCaseId: string,
    issuerId: string,
    tx?: any,
  ) {
    const client = tx ?? this.prisma.client;
    const org = await client.issuerOrg.findFirst({
      where: { representativeUserId: issuerId },
      orderBy: { createdAt: 'asc' },
    });
    if (!org) throw new ForbiddenException('No issuer org found');

    const tc = await client.transferCase.findUnique({
      where: { id: transferCaseId },
      include: { opportunity: { select: { issuerOrgId: true } } },
    });

    if (!tc || tc.opportunity.issuerOrgId !== org.id) {
      throw new NotFoundException('Transfer case not found');
    }

    return { org, tc };
  }

  private async assertSellerOwnsTransfer(
    tenantId: string,
    transferCaseId: string,
    sellerId: string,
  ) {
    const tc = await this.prisma.client.transferCase.findUnique({
      where: { id: transferCaseId },
    });
    if (!tc) throw new NotFoundException('Transfer case not found');
    if (tc.tenantId !== tenantId) {
      throw new NotFoundException('Transfer case not found');
    }
    if (tc.sellerId !== sellerId) {
      throw new ForbiddenException(
        'Only the seller can invite a buyer for this transfer',
      );
    }
  }

  private isTerminalStatus(status: string) {
    return (TERMINAL_STATUSES as readonly string[]).includes(status);
  }

  private async isBuyerKycApproved(
    tenantId: string,
    buyerId: string,
    tx?: any,
  ): Promise<boolean> {
    const client = tx ?? this.prisma.client;
    const v = await client.verification.findFirst({
      where: { tenantId, userId: buyerId },
      orderBy: { updatedAt: 'desc' },
    });
    return v?.status === 'APPROVED';
  }

  private async advanceBuyerAttachment(
    transferCaseId: string,
    buyerId: string,
    priorStatus: string,
    actorId: string | null,
    notesPrefix = 'Buyer attached',
    tx?: any,
  ) {
    const operation = async (innerTx: any) => {
      const tc = await this.loadCase(transferCaseId, innerTx);
      await innerTx.transferCase.update({
        where: { id: transferCaseId },
        data: { buyerId },
      });
      const kycOk = await this.isBuyerKycApproved(tc.tenantId, buyerId, innerTx);
      await this.advanceStatus(
        transferCaseId,
        priorStatus,
        'BUYER_SELECTED',
        actorId,
        notesPrefix,
        {},
        innerTx,
      );
      const next = kycOk ? 'COMPLIANCE_REVIEW' : 'BUYER_VERIFICATION_PENDING';
      if (kycOk) {
        const updated = await this.loadCase(transferCaseId, innerTx);
        await this.assertBuyerCompliance(updated, actorId, innerTx);
      }
      await this.advanceStatus(
        transferCaseId,
        'BUYER_SELECTED',
        next,
        actorId,
        kycOk ? 'Buyer KYC approved' : 'Awaiting buyer KYC',
        {},
        innerTx,
      );
    };

    if (tx) {
      await operation(tx);
    } else {
      await this.prisma.client.$transaction(operation);
    }
  }

  private async maybeAdvanceAfterKycReady(
    transferCaseId: string,
    actorId: string | null,
    tx?: any,
  ) {
    const tc = await this.lockCase(transferCaseId, tx);
    if (tc.status !== 'KYC_READY' || !tc.buyerId) return;
    await this.advanceBuyerAttachment(
      transferCaseId,
      tc.buyerId,
      'KYC_READY',
      actorId,
      'Known buyer attached after priority / KYC-ready gate',
      tx,
    );
  }

  private async syncBuyerVerificationGate(
    transferCaseId: string,
    actorId: string,
    tx?: any,
  ) {
    const tc = await this.loadCase(transferCaseId, tx);
    if (!tc.buyerId) return;
    const kycOk = await this.isBuyerKycApproved(tc.tenantId, tc.buyerId, tx);
    if (tc.status === 'BUYER_VERIFICATION_PENDING' && kycOk) {
      await this.assertBuyerCompliance(tc, actorId, tx);
      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'COMPLIANCE_REVIEW',
        actorId,
        'Buyer KYC approved',
        {},
        tx,
      );
      return;
    }
    if (tc.status === 'COMPLIANCE_REVIEW' && !kycOk) {
      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'BUYER_VERIFICATION_PENDING',
        actorId,
        'Buyer KYC required before compliance',
        {},
        tx,
      );
    } else if (tc.status === 'COMPLIANCE_REVIEW' && kycOk) {
      await this.assertBuyerCompliance(tc, actorId, tx);
    }
  }

  private async assertBuyerCompliance(tc: any, actorId: string | null, tx?: any) {
    if (!tc.buyerId) {
      throw new BadRequestException('No buyer on case');
    }
    const result = await this.rulesEngine.evaluateBuyer({
      tenantId: tc.tenantId,
      buyerId: tc.buyerId,
      opportunityId: tc.opportunityId,
      tx,
    });
    if (!result.approved) {
      await this.auditService.logTenantAction({
        actorId: actorId ?? tc.buyerId,
        action: AuditAction.TRANSFER_REJECTED,
        targetType: 'TransferCase',
        targetId: tc.id,
        details: {
          reference: tc.reference,
          event: 'buyer_compliance_failed',
          reasons: result.reasons,
          checks: result.checks,
        },
      });
      throw new BadRequestException(
        `Buyer compliance failed: ${result.reasons.join('; ')}`,
      );
    }
  }

  private async assertDistinctFinalApprover(
    transferCaseId: string,
    actorId: string,
    tx: any,
  ) {
    const approval = await tx.transferStatusHistory.findFirst({
      where: {
        transferCaseId,
        toStatus: 'REGISTER_UPDATE_IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) {
      throw new BadRequestException(
        'Final registry approval is required before finalize',
      );
    }
    if (approval.actorId === actorId) {
      throw new BadRequestException(
        'Registry finalize requires a different admin from final approval',
      );
    }
  }

  private async assertAllRequiredChecklistApproved(transferCaseId: string) {
    const pending = await this.prisma.client.transferChecklistItem.count({
      where: {
        transferCaseId,
        required: true,
        status: { not: 'APPROVED' },
      },
    });
    if (pending > 0) {
      throw new BadRequestException(
        'All required checklist items must be approved before continuing',
      );
    }
  }

  private deriveNextAction(status: string): string {
    const map: Record<string, string> = {
      SUBMITTED: 'Wait for rules evaluation',
      RULES_CHECK: 'Complete rules evaluation',
      MANAGER_REVIEW: 'Issuer review (open priority window or skip)',
      PRIORITY_WINDOW: 'Wait for shareholder responses or window expiry',
      KYC_READY: 'Select or invite buyer',
      BUYER_SELECTED: 'Continue buyer onboarding',
      BUYER_VERIFICATION_PENDING: 'Buyer completes KYC',
      COMPLIANCE_REVIEW: 'Request documents / run compliance',
      DOCS_PENDING: 'Collect and approve documents',
      PAYMENT_PENDING: 'Confirm payment',
      PAYMENT_CONFIRMED: 'Issuer final approval before registry',
      REGISTER_UPDATE_IN_PROGRESS: 'Execute register update',
      FINALIZING: 'Execute register update',
      ESCALATED: 'Compliance / ops resolution',
      REJECTED: 'Case closed',
      EXPIRED: 'Case closed',
      CANCELLED: 'Case closed',
      COMPLETED: 'Done',
    };
    return map[status] ?? 'Review case';
  }

  private appendTransferListQueryFilters(
    and: Record<string, unknown>[],
    query: QueryTransfersDto,
  ) {
    if (query.status) and.push({ status: query.status });
    if (query.dueBefore || query.dueAfter) {
      const due: Record<string, Date> = {};
      if (query.dueAfter) due.gte = new Date(query.dueAfter);
      if (query.dueBefore) due.lte = new Date(query.dueBefore);
      and.push({ dueAt: due });
    }
    if (query.assignedToUserId) {
      and.push({ assignedToUserId: query.assignedToUserId });
    }
    if (query.referenceContains) {
      and.push({
        reference: {
          contains: query.referenceContains,
          mode: 'insensitive',
        },
      });
    }

    if (query.priorityState === 'OPEN') {
      and.push({ status: 'PRIORITY_WINDOW' });
      and.push({ priorityNotices: { some: { status: 'PENDING' } } });
    } else if (query.priorityState === 'CLOSED') {
      and.push({ status: 'PRIORITY_WINDOW' });
      and.push({
        NOT: { priorityNotices: { some: { status: 'PENDING' } } },
      });
    } else if (query.priorityState === 'NONE') {
      and.push({ NOT: { status: 'PRIORITY_WINDOW' } });
    }

    if (query.buyerVerificationState === 'NONE') {
      and.push({ buyerId: null });
    } else if (query.buyerVerificationState === 'VERIFIED') {
      and.push({ buyerId: { not: null } });
      and.push({
        buyer: { verifications: { some: { status: 'APPROVED' } } },
      });
    } else if (query.buyerVerificationState === 'PENDING') {
      and.push({ buyerId: { not: null } });
      and.push({
        NOT: {
          buyer: { verifications: { some: { status: 'APPROVED' } } },
        },
      });
    }
  }

  private buildIssuerListWhere(
    opportunityIds: string[],
    query: QueryTransfersDto,
  ): Record<string, unknown> {
    if (opportunityIds.length === 0) {
      return { opportunityId: { in: [] } };
    }

    const and: Record<string, unknown>[] = [
      { opportunityId: { in: opportunityIds } },
    ];

    if (query.opportunityId) {
      if (!opportunityIds.includes(query.opportunityId)) {
        return { opportunityId: { in: [] } };
      }
      and[0] = { opportunityId: query.opportunityId };
    }

    this.appendTransferListQueryFilters(and, query);

    return { AND: and };
  }

  private async advanceStatus(
    caseId: string,
    fromStatus: string | null,
    toStatus: string,
    actorId: string | null,
    notes?: string,
    extra?: Record<string, any>,
    tx?: any,
  ) {
    const operation = async (innerTx: any) => {
      const tc = await innerTx.transferCase.findUnique({
        where: { id: caseId },
        select: { status: true },
      });

      if (!tc) throw new NotFoundException('Transfer case not found');

      if (this.isTerminalStatus(tc.status) && tc.status !== toStatus) {
        throw new BadRequestException(
          `Cannot change status of a terminal transfer case (${tc.status})`,
        );
      }

      // TR-12: Enforce centralised FSM transitions
      const allowed = VALID_TRANSITIONS[tc.status];
      if (allowed && !allowed.includes(toStatus)) {
        throw new BadRequestException(
          `Invalid state transition: ${tc.status} -> ${toStatus}`,
        );
      }

      await innerTx.transferCase.update({
        where: { id: caseId },
        data: { status: toStatus as any, ...extra },
      });

      await innerTx.transferStatusHistory.create({
        data: {
          transferCaseId: caseId,
          fromStatus: fromStatus as any,
          toStatus: toStatus as any,
          actorId,
          notes,
        },
      });
    };

    if (tx) {
      await operation(tx);
    } else {
      await this.prisma.client.$transaction(operation);
    }
  }

  // ─── Investor endpoints ─────────────────────────────────────────────────────

  async createTransferRequest(
    tenantId: string,
    sellerId: string,
    dto: CreateTransferRequestDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      // 1. Lock the holding to prevent concurrent transfer creations
      await tx.$executeRaw`SELECT id FROM "holdings" WHERE "id" = ${dto.holdingId} FOR UPDATE`;

      const initiationType =
        dto.initiationType === TransferInitiationTypeDto.KNOWN_BUYER ||
        dto.buyerId
          ? 'KNOWN_BUYER'
          : 'ISSUER_MANAGED';

      if (initiationType === 'KNOWN_BUYER' && !dto.buyerId) {
        throw new BadRequestException(
          'Known buyer transfers require buyerId (same tenant as seller)',
        );
      }

      let knownBuyerId: string | undefined;
      if (dto.buyerId) {
        if (dto.buyerId === sellerId) {
          throw new BadRequestException('Buyer cannot be the seller');
        }
        const buyer = await tx.user.findFirst({
          where: { id: dto.buyerId, tenantId },
        });
        if (!buyer) {
          throw new BadRequestException('Buyer not found in this tenant');
        }
        knownBuyerId = buyer.id;
      }

      // Load holding to get opportunityId
      const holding = await tx.holding.findUnique({
        where: { id: dto.holdingId },
        include: { opportunity: { select: { currency: true } } },
      });
      if (!holding || holding.userId !== sellerId) {
        throw new NotFoundException('Holding not found');
      }

      // Run rules engine (passing tx for internal checks)
      const rulesResult = await this.rulesEngine.evaluate({
        tenantId,
        holdingId: dto.holdingId,
        opportunityId: holding.opportunityId,
        sellerId,
        buyerId: knownBuyerId,
        quantity: dto.quantity,
        tx,
      });

      if (!rulesResult.approved) {
        const failedRules = Object.entries(rulesResult.checks)
          .filter(([, check]) => !check.passed)
          .map(([rule, check]) => ({
            rule,
            reason: check.message,
          }));
        const primaryReason = failedRules[0]?.reason ?? rulesResult.reasons[0];

        throw new BadRequestException({
          message: 'Transfer request failed rules check',
          error: 'TransferRulesFailed',
          reason: primaryReason,
          reasons: rulesResult.reasons,
          failedRules,
          checks: rulesResult.checks,
        });
      }

      // Generate reference
      const tenant = this.tenantContext.getTenant();
      const slug = (tenant?.slug ?? 'TENANT').toUpperCase();
      const year = new Date().getFullYear();

      // Use a DB sequence to avoid reference collisions under concurrency.
      let seqBase: number;
      try {
        const rows = await tx.$queryRaw<
          Array<{ seq: bigint | number }>
        >`SELECT nextval('transfer_reference_seq')::bigint as seq`;
        const raw = rows?.[0]?.seq;
        seqBase = typeof raw === 'bigint' ? Number(raw) : Number(raw);
        if (!Number.isFinite(seqBase) || seqBase <= 0) throw new Error('bad seq');
      } catch {
        seqBase =
          (await tx.transferCase.count({ where: {} })) + 1;
      }

      let tc: any;
      let reference = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const seq = String(seqBase + attempt).padStart(6, '0');
        reference = `${slug}-${year}-TX-${seq}`;
        try {
          tc = await tx.transferCase.create({
            data: {
              tenantId,
              reference,
              sellerId,
              buyerId: knownBuyerId,
              holdingId: dto.holdingId,
              opportunityId: holding.opportunityId,
              quantity: dto.quantity,
              proposedPrice: dto.proposedPrice,
              currency: dto.currency ?? holding.opportunity?.currency ?? 'USD',
              initiationType: initiationType as any,
              status: 'DRAFT',
              rulesResult: rulesResult as any,
            },
          });
          break;
        } catch (err: any) {
          const isUniqueViolation =
            typeof err?.code === 'string' && err.code === 'P2002';
          if (!isUniqueViolation || attempt === 4) throw err;
        }
      }

      await this.advanceStatus(
        tc.id,
        null,
        'SUBMITTED',
        sellerId,
        'Transfer request submitted',
        undefined,
        tx,
      );

      await this.advanceStatus(
        tc.id,
        'SUBMITTED',
        'RULES_CHECK',
        sellerId,
        'Rules evaluation passed',
        undefined,
        tx,
      );

      await this.advanceStatus(
        tc.id,
        'RULES_CHECK',
        'MANAGER_REVIEW',
        sellerId,
        'Transfer entered manager review',
        undefined,
        tx,
      );

      await this.auditService.logTenantAction({
        actorId: sellerId,
        action: AuditAction.TRANSFER_CREATED,
        targetType: 'TransferCase',
        targetId: tc.id,
        details: {
          reference,
          holdingId: dto.holdingId,
          quantity: dto.quantity,
          event: 'created',
        },
      });

      await this.notifications.create(
        tenantId,
        sellerId,
        'TRANSFER_UPDATE',
        'Transfer Request Submitted',
        `Your request to transfer ${dto.quantity} units has been submitted successfully. Reference: ${reference}`,
      );

      return {
        id: tc.id,
        reference: tc.reference,
        status: 'MANAGER_REVIEW',
        initiationType,
        buyerId: knownBuyerId ?? null,
        quantity: tc.quantity,
        proposedPrice: tc.proposedPrice,
        currency: tc.currency,
        createdAt: tc.createdAt,
      };
    });
  }

  async listMyTransfers(sellerId: string, query: QueryTransfersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { sellerId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.client.transferCase.findMany({
        where,
        include: {
          opportunity: { select: { title: true } },
          holding: { select: { units: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.transferCase.count({ where }),
    ]);

    return {
      data: data.map((tc) => ({
        id: tc.id,
        reference: tc.reference,
        status: tc.status,
        quantity: tc.quantity,
        proposedPrice: tc.proposedPrice,
        currency: tc.currency,
        createdAt: tc.createdAt,
        opportunityTitle: tc.opportunity.title,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransferDetail(transferCaseId: string, userId: string) {
    const tc = await this.prisma.client.transferCase.findUnique({
      where: { id: transferCaseId },
      include: {
        opportunity: {
          select: { title: true, assetClass: true, region: true },
        },
        holding: { select: { units: true, acquisitionDate: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        priorityNotices: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            respondedAt: true,
          },
        },
      },
    });

    if (!tc) throw new NotFoundException('Transfer case not found');
    if (tc.sellerId !== userId && tc.buyerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const completedAt =
      tc.registryMutatedAt ??
      tc.statusHistory.find((h) => h.toStatus === 'COMPLETED')?.createdAt ??
      null;

    return {
      id: tc.id,
      reference: tc.reference,
      status: tc.status,
      initiationType: tc.initiationType,
      quantity: tc.quantity,
      proposedPrice: tc.proposedPrice,
      currency: tc.currency,
      priorityWindowExpiresAt: tc.priorityWindowExpiresAt,
      completedAt,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt,
      opportunity: tc.opportunity,
      holding: tc.holding,
      statusHistory: tc.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        notes: h.notes,
        createdAt: h.createdAt,
      })),
      priorityNotices: tc.priorityNotices,
    };
  }

  async cancelTransfer(
    transferCaseId: string,
    userId: string,
    reason?: string,
  ) {
    const tc = await this.loadCase(transferCaseId);

    if (tc.sellerId !== userId) {
      throw new ForbiddenException('Only seller can cancel');
    }
    if (this.isTerminalStatus(tc.status)) {
      throw new BadRequestException(`Cannot cancel a ${tc.status} transfer`);
    }

    await this.advanceStatus(
      tc.id,
      tc.status,
      'CANCELLED',
      userId,
      reason ?? 'Cancelled by seller',
      { cancelledReason: reason },
    );

    await this.auditService.logTenantAction({
      actorId: userId,
      action: AuditAction.TRANSFER_CANCELLED,
      targetType: 'TransferCase',
      targetId: tc.id,
      details: { reference: tc.reference, reason },
    });

    await this.notifications.create(
      tc.tenantId,
      tc.sellerId,
      'TRANSFER_UPDATE',
      'Transfer Cancelled',
      `Your transfer request ${tc.reference} has been cancelled.`,
    );

    return { id: tc.id, status: 'CANCELLED' };
  }

  // ─── Priority notices (investor) ────────────────────────────────────────────

  async getMyPriorityNotices(userId: string) {
    const notices = await this.prisma.client.priorityNotice.findMany({
      where: { holderId: userId },
      include: {
        transferCase: {
          select: {
            id: true,
            reference: true,
            quantity: true,
            proposedPrice: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notices.map((n) => ({
      id: n.id,
      status: n.status,
      expiresAt: n.expiresAt,
      respondedAt: n.respondedAt,
      createdAt: n.createdAt,
      transferCase: n.transferCase,
    }));
  }

  async exercisePriorityNotice(
    tenantId: string,
    userId: string,
    noticeId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const notice = await tx.priorityNotice.findUnique({
        where: { id: noticeId },
        include: { transferCase: true },
      });

      if (!notice || notice.holderId !== userId) {
        throw new NotFoundException('Priority notice not found');
      }
      if (notice.status !== 'PENDING') {
        throw new BadRequestException(
          `Cannot exercise a ${notice.status} notice`,
        );
      }
      if (new Date() > notice.expiresAt) {
        throw new BadRequestException('Priority notice has expired');
      }

      // Lock the case to prevent concurrent status movements
      const tc = await this.lockCase(notice.transferCaseId, tx);

      await tx.priorityNotice.update({
        where: { id: noticeId },
        data: { status: 'EXERCISED', respondedAt: new Date() },
      });

      await this.advanceBuyerAttachment(
        notice.transferCaseId,
        userId,
        tc.status,
        userId,
        'Priority right exercised — buyer attached',
        tx,
      );

      return { id: noticeId, status: 'EXERCISED' };
    });
  }

  async waivePriorityNotice(
    tenantId: string,
    userId: string,
    noticeId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const notice = await tx.priorityNotice.findUnique({
        where: { id: noticeId },
      });

      if (!notice || notice.holderId !== userId) {
        throw new NotFoundException('Priority notice not found');
      }
      if (notice.status !== 'PENDING') {
        throw new BadRequestException(`Cannot waive a ${notice.status} notice`);
      }

      await tx.priorityNotice.update({
        where: { id: noticeId },
        data: { status: 'WAIVED', respondedAt: new Date() },
      });

      await this.checkPriorityWindowComplete(notice.transferCaseId, tx);

      return { id: noticeId, status: 'WAIVED' };
    });
  }

  // ─── Issuer endpoints ───────────────────────────────────────────────────────

  async listIssuerTransfers(issuerId: string, query: QueryTransfersDto) {
    const org = await this.prisma.client.issuerOrg.findFirst({
      where: { representativeUserId: issuerId },
      orderBy: { createdAt: 'asc' },
    });
    if (!org) throw new ForbiddenException('No issuer org found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const opportunityIds = (
      await this.prisma.client.opportunity.findMany({
        where: { issuerOrgId: org.id },
        select: { id: true },
      })
    ).map((o) => o.id);

    const where = this.buildIssuerListWhere(opportunityIds, query);

    const [data, total] = await Promise.all([
      this.prisma.client.transferCase.findMany({
        where,
        include: {
          opportunity: { select: { title: true } },
          seller: { select: { email: true, fullName: true } },
          buyer: { select: { id: true, email: true, fullName: true } },
          priorityNotices: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.transferCase.count({ where }),
    ]);

    const buyerIds = [
      ...new Set(data.map((tc) => tc.buyerId).filter(Boolean) as string[]),
    ];
    const kycMap = new Map<string, boolean>();
    const tenantIdForKyc = data[0]?.tenantId;
    if (buyerIds.length > 0 && tenantIdForKyc) {
      const verifications = await this.prisma.client.verification.findMany({
        where: { tenantId: tenantIdForKyc, userId: { in: buyerIds } },
        orderBy: { updatedAt: 'desc' },
      });
      for (const v of verifications) {
        if (!kycMap.has(v.userId)) {
          kycMap.set(v.userId, v.status === 'APPROVED');
        }
      }
    }

    return {
      data: data.map((tc) => {
        const hasPendingNotice =
          tc.status === 'PRIORITY_WINDOW' &&
          tc.priorityNotices.some((n) => n.status === 'PENDING');
        const priorityStateDerived: 'OPEN' | 'CLOSED' | 'NONE' =
          tc.status !== 'PRIORITY_WINDOW'
            ? 'NONE'
            : hasPendingNotice
              ? 'OPEN'
              : 'CLOSED';

        return {
          id: tc.id,
          reference: tc.reference,
          status: tc.status,
          initiationType: tc.initiationType,
          quantity: tc.quantity,
          proposedPrice: tc.proposedPrice,
          currency: tc.currency,
          dueAt: tc.dueAt,
          assignedToUserId: tc.assignedToUserId,
          createdAt: tc.createdAt,
          opportunityTitle: tc.opportunity.title,
          seller: tc.seller,
          buyer: tc.buyer,
          buyerVerificationState: tc.buyerId
            ? kycMap.get(tc.buyerId)
              ? 'VERIFIED'
              : 'PENDING'
            : 'NONE',
          priorityState: priorityStateDerived,
        };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getIssuerTransferDetail(transferCaseId: string, issuerId: string) {
    await this.assertIssuerAccess(transferCaseId, issuerId);

    const tc = await this.prisma.client.transferCase.findUnique({
      where: { id: transferCaseId },
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            assetClass: true,
            region: true,
            currency: true,
            rofrEnabled: true,
            rofrWindowDays: true,
          },
        },
        seller: { select: { id: true, email: true, fullName: true } },
        buyer: { select: { id: true, email: true, fullName: true } },
        assignedTo: {
          select: { id: true, email: true, fullName: true },
        },
        holding: {
          select: {
            id: true,
            units: true,
            acquisitionDate: true,
            status: true,
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        priorityNotices: {
          include: {
            holder: { select: { id: true, email: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        registryEntries: { orderBy: { sealedAt: 'asc' } },
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        invitations: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!tc) throw new NotFoundException('Transfer case not found');

    let buyerVerification: {
      status: string | null;
      eligibilityStatus: string | null;
    } | null = null;
    if (tc.buyerId) {
      const v = await this.prisma.client.verification.findFirst({
        where: { tenantId: tc.tenantId, userId: tc.buyerId },
        orderBy: { updatedAt: 'desc' },
        select: { status: true, eligibilityStatus: true },
      });
      buyerVerification = v
        ? { status: v.status, eligibilityStatus: v.eligibilityStatus }
        : { status: null, eligibilityStatus: null };
    }

    const auditTimeline = await this.prisma.client.auditLogEvent.findMany({
      where: {
        tenantId: tc.tenantId,
        targetType: 'TransferCase',
        targetId: transferCaseId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        actorId: true,
        details: true,
        createdAt: true,
      },
    });

    const hasPendingNotice =
      tc.status === 'PRIORITY_WINDOW' &&
      tc.priorityNotices.some((n) => n.status === 'PENDING');
    const priorityStateDerived: 'OPEN' | 'CLOSED' | 'NONE' =
      tc.status !== 'PRIORITY_WINDOW'
        ? 'NONE'
        : hasPendingNotice
          ? 'OPEN'
          : 'CLOSED';

    return {
      id: tc.id,
      reference: tc.reference,
      status: tc.status,
      initiationType: tc.initiationType,
      dueAt: tc.dueAt,
      assignedToUserId: tc.assignedToUserId,
      assignedTo: tc.assignedTo,
      quantity: tc.quantity,
      proposedPrice: tc.proposedPrice,
      currency: tc.currency,
      priorityWindowExpiresAt: tc.priorityWindowExpiresAt,
      paymentReference: tc.paymentReference,
      paymentConfirmedAt: tc.paymentConfirmedAt,
      paymentConfirmedBy: tc.paymentConfirmedBy,
      registryMutatedAt: tc.registryMutatedAt,
      registryMutatedBy: tc.registryMutatedBy,
      cancelledReason: tc.cancelledReason,
      escalatedReason: tc.escalatedReason,
      rejectedReason: tc.rejectedReason,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt,
      nextAction: this.deriveNextAction(tc.status),
      priorityState: priorityStateDerived,
      seller: tc.seller,
      buyer: tc.buyer,
      buyerVerification,
      holding: tc.holding,
      opportunity: tc.opportunity,
      statusHistory: tc.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        notes: h.notes,
        createdAt: h.createdAt,
      })),
      priorityNotices: tc.priorityNotices.map((n) => ({
        id: n.id,
        status: n.status,
        expiresAt: n.expiresAt,
        respondedAt: n.respondedAt,
        holder: n.holder,
      })),
      checklistItems: tc.checklistItems.map((c) => ({
        id: c.id,
        itemKey: c.itemKey,
        title: c.title,
        description: c.description,
        required: c.required,
        status: c.status,
        sortOrder: c.sortOrder,
        reviewedAt: c.reviewedAt,
        rejectionReason: c.rejectionReason,
      })),
      invitations: tc.invitations.map((inv) => ({
        id: inv.id,
        invitedEmail: inv.invitedEmail,
        invitedUserId: inv.invitedUserId,
        status: inv.status,
        expiresAt: inv.expiresAt,
        respondedAt: inv.respondedAt,
        message: inv.message,
        createdAt: inv.createdAt,
      })),
      registryEntries: tc.registryEntries.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        fromUserId: r.fromUserId,
        toUserId: r.toUserId,
        quantity: r.quantity,
        sealedAt: r.sealedAt,
        sealedBy: r.sealedBy,
      })),
      auditTimeline,
    };
  }

  async issuerAssignBuyer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    buyerId: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.adminAssignBuyer(tenantId, issuerId, transferCaseId, buyerId);
  }

  async issuerMarkDocsComplete(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.adminMarkDocsComplete(tenantId, issuerId, transferCaseId);
  }

  async issuerConfirmPayment(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    paymentReference: string,
    notes?: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.adminConfirmPayment(
      tenantId,
      issuerId,
      transferCaseId,
      paymentReference,
      notes,
    );
  }

  async issuerFinalizeTransfer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    const tc = await this.loadCase(transferCaseId);
    // Critical gate: issuer must NOT bypass payment + final approval.
    if (
      tc.status !== 'REGISTER_UPDATE_IN_PROGRESS' &&
      tc.status !== 'FINALIZING'
    ) {
      throw new BadRequestException(
        `Cannot finalize register update in status "${tc.status}"`,
      );
    }
    return this.adminFinalizeTransfer(tenantId, issuerId, transferCaseId);
  }

  async issuerEscalateTransfer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    reason: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.adminEscalateTransfer(
      tenantId,
      issuerId,
      transferCaseId,
      reason,
    );
  }

  async issuerCancelTransfer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    reason?: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.adminCancelTransfer(tenantId, issuerId, transferCaseId, reason);
  }

  async issuerRejectTransfer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    reason: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId);
      const tc = await this.lockCase(transferCaseId, tx);
      if (this.isTerminalStatus(tc.status)) {
        throw new BadRequestException(`Cannot reject a ${tc.status} transfer`);
      }

      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'REJECTED',
        issuerId,
        reason,
        { rejectedReason: reason },
        tx,
      );

      await this.auditService.logTenantAction({
        actorId: issuerId,
        action: AuditAction.TRANSFER_REJECTED,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: { reference: tc.reference, reason },
      });

      await this.notifications.create(
        tenantId,
        tc.sellerId,
        'TRANSFER_UPDATE',
        'Transfer Rejected',
        `Your transfer ${tc.reference} has been rejected by the issuer.`,
      );

      return { id: transferCaseId, status: 'REJECTED' };
    });
  }

  async issuerOpenPriorityWindow(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId);
      const tc = await this.lockCase(transferCaseId, tx);
      if (tc.status !== 'MANAGER_REVIEW') {
        throw new BadRequestException(
          `Cannot open priority window in status "${tc.status}"`,
        );
      }
      const opportunity = await tx.opportunity.findUnique({
        where: { id: tc.opportunityId },
      });
      if (!opportunity?.rofrEnabled) {
        throw new BadRequestException(
          'ROFR is disabled for this opportunity — skip priority instead',
        );
      }
      await this.triggerRofrWindow(tenantId, tc, issuerId, opportunity, tx);
      await this.notifications.create(
        tenantId,
        tc.sellerId,
        'TRANSFER_UPDATE',
        'Priority window opened',
        `A shareholder priority window has been opened for ${tc.reference}.`,
      );
      return { id: transferCaseId, status: 'PRIORITY_WINDOW' };
    });
  }

  async issuerRelaunchPriorityNotices(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    extendDays = 7,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    const tc = await this.loadCase(transferCaseId);
    if (tc.status !== 'PRIORITY_WINDOW') {
      throw new BadRequestException(
        `Cannot relaunch notices in status "${tc.status}"`,
      );
    }
    const base = tc.priorityWindowExpiresAt
      ? new Date(tc.priorityWindowExpiresAt)
      : new Date();
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + extendDays);

    await this.prisma.client.transferCase.update({
      where: { id: transferCaseId },
      data: { priorityWindowExpiresAt: expiresAt },
    });

    await this.prisma.client.priorityNotice.updateMany({
      where: { transferCaseId, status: 'PENDING' },
      data: { expiresAt },
    });

    const coHolders = await this.prisma.client.holding.findMany({
      where: {
        opportunityId: tc.opportunityId,
        tenantId,
        status: 'ACTIVE',
        units: { gt: 0 },
        userId: { not: tc.sellerId },
      },
    });

    for (const h of coHolders) {
      const existing = await this.prisma.client.priorityNotice.findFirst({
        where: { transferCaseId, holderId: h.userId },
      });
      if (!existing) {
        await this.prisma.client.priorityNotice.create({
          data: {
            tenantId,
            transferCaseId,
            holderId: h.userId,
            holdingId: h.id,
            status: 'PENDING',
            expiresAt,
          },
        });
      }
    }

    await this.auditService.logTenantAction({
      actorId: issuerId,
      action: AuditAction.REQUEST_STATUS_CHANGE,
      targetType: 'TransferCase',
      targetId: transferCaseId,
      details: {
        reference: tc.reference,
        event: 'priority_notices_relaunched',
        extendDays,
        expiresAt,
      },
    });

    return {
      id: transferCaseId,
      status: tc.status,
      priorityWindowExpiresAt: expiresAt,
    };
  }

  async issuerRequestDocuments(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    items: Array<{
      itemKey: string;
      title: string;
      description?: string;
      required?: boolean;
    }>,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId, tx);
      const tc = await this.lockCase(transferCaseId, tx);
      if (items.length === 0) {
        throw new BadRequestException('At least one checklist item is required');
      }

      if (tc.status === 'COMPLIANCE_REVIEW') {
        await this.advanceStatus(
          transferCaseId,
          tc.status,
          'DOCS_PENDING',
          issuerId,
          'Document collection requested',
          {},
          tx,
        );
      } else if (tc.status !== 'DOCS_PENDING') {
        throw new BadRequestException(
          `Cannot request documents in status "${tc.status}"`,
        );
      }

      let sortBase =
        (await tx.transferChecklistItem.count({
          where: { transferCaseId },
        })) ?? 0;

      for (const it of items) {
        sortBase += 1;
        await tx.transferChecklistItem.create({
          data: {
            tenantId,
            transferCaseId,
            itemKey: it.itemKey,
            title: it.title,
            description: it.description,
            required: it.required ?? true,
            sortOrder: sortBase,
          },
        });
      }

      await this.auditService.logTenantAction({
        actorId: issuerId,
        action: AuditAction.REQUEST_STATUS_CHANGE,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: {
          reference: tc.reference,
          event: 'checklist_items_added',
          keys: items.map((i) => i.itemKey),
        },
      });

      const next = await this.loadCase(transferCaseId, tx);
      return {
        id: transferCaseId,
        status: next.status,
        itemsAdded: items.length,
      };
    });
  }

  /**
   * Shared implementation: caller must enforce issuer or seller authorization first.
   */
  private async createTransferBuyerInvitation(
    tenantId: string,
    actorUserId: string,
    transferCaseId: string,
    params: {
      email: string;
      invitedUserId?: string;
      message?: string;
      expiresInDays?: number;
    },
  ) {
    const tc = await this.loadCase(transferCaseId);
    if (tc.tenantId !== tenantId) {
      throw new NotFoundException('Transfer case not found');
    }
    if (tc.status !== 'KYC_READY') {
      throw new BadRequestException(
        `Cannot invite buyer in status "${tc.status}"`,
      );
    }
    if (tc.buyerId) {
      throw new BadRequestException(
        'Buyer already assigned — use buyer reassignment instead',
      );
    }

    const email = params.email.trim().toLowerCase();
    if (params.invitedUserId) {
      const invited = await this.prisma.client.user.findFirst({
        where: { id: params.invitedUserId, tenantId },
      });
      if (!invited) {
        throw new BadRequestException('invitedUserId not found in tenant');
      }
      if (invited.email.trim().toLowerCase() !== email) {
        throw new BadRequestException(
          'invitedUserId email does not match invitation email',
        );
      }
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 14));

    const inv = await this.prisma.client.transferInvitation.create({
      data: {
        tenantId,
        transferCaseId,
        invitedEmail: email,
        invitedUserId: params.invitedUserId ?? null,
        tokenHash,
        status: 'PENDING',
        expiresAt,
        createdByUserId: actorUserId,
        message: params.message ?? null,
      },
    });

    await this.auditService.logTenantAction({
      actorId: actorUserId,
      action: AuditAction.REQUEST_STATUS_CHANGE,
      targetType: 'TransferCase',
      targetId: transferCaseId,
      details: {
        reference: tc.reference,
        event: 'buyer_invited',
        invitationId: inv.id,
        email,
      },
    });

    return {
      invitationId: inv.id,
      expiresAt,
      acceptToken: token,
    };
  }

  async issuerInviteBuyer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    params: {
      email: string;
      invitedUserId?: string;
      message?: string;
      expiresInDays?: number;
    },
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    return this.createTransferBuyerInvitation(
      tenantId,
      issuerId,
      transferCaseId,
      params,
    );
  }

  async sellerInviteBuyer(
    tenantId: string,
    sellerId: string,
    transferCaseId: string,
    params: {
      email: string;
      invitedUserId?: string;
      message?: string;
      expiresInDays?: number;
    },
  ) {
    await this.assertSellerOwnsTransfer(tenantId, transferCaseId, sellerId);
    return this.createTransferBuyerInvitation(
      tenantId,
      sellerId,
      transferCaseId,
      params,
    );
  }

  async issuerUpdateCaseMeta(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    dto: { dueAt?: string | null; assignedToUserId?: string | null },
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    if (dto.dueAt === undefined && dto.assignedToUserId === undefined) {
      throw new BadRequestException('No updates provided');
    }
    if (dto.assignedToUserId) {
      const u = await this.prisma.client.user.findFirst({
        where: { id: dto.assignedToUserId, tenantId },
      });
      if (!u) throw new BadRequestException('Assignee not found in tenant');
    }

    const data: Record<string, unknown> = {};
    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }
    if (dto.assignedToUserId !== undefined) {
      data.assignedToUserId = dto.assignedToUserId;
    }

    await this.prisma.client.transferCase.update({
      where: { id: transferCaseId },
      data: data as any,
    });

    return this.getIssuerTransferDetail(transferCaseId, issuerId);
  }

  async issuerConfirmBuyerKycReady(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId, tx);
      const tc = await this.lockCase(transferCaseId, tx);
      if (tc.status !== 'BUYER_VERIFICATION_PENDING') {
        throw new BadRequestException(
          `Case is not awaiting buyer verification (${tc.status})`,
        );
      }
      if (!tc.buyerId) throw new BadRequestException('No buyer on case');
      const ok = await this.isBuyerKycApproved(tc.tenantId, tc.buyerId, tx);
      if (!ok) {
        throw new BadRequestException('Buyer KYC is not approved yet');
      }
      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'COMPLIANCE_REVIEW',
        issuerId,
        'Buyer KYC verified — compliance review',
        {},
        tx,
      );
      return { id: transferCaseId, status: 'COMPLIANCE_REVIEW' };
    });
  }

  async issuerApproveChecklistItem(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    itemId: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    const item = await this.prisma.client.transferChecklistItem.findFirst({
      where: { id: itemId, transferCaseId, tenantId },
    });
    if (!item) throw new NotFoundException('Checklist item not found');
    await this.prisma.client.transferChecklistItem.update({
      where: { id: itemId },
      data: {
        status: 'APPROVED',
        reviewedBy: issuerId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });
    return { id: itemId, status: 'APPROVED' };
  }

  async issuerRejectChecklistItem(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    itemId: string,
    reason: string,
  ) {
    await this.assertIssuerAccess(transferCaseId, issuerId);
    const item = await this.prisma.client.transferChecklistItem.findFirst({
      where: { id: itemId, transferCaseId, tenantId },
    });
    if (!item) throw new NotFoundException('Checklist item not found');
    await this.prisma.client.transferChecklistItem.update({
      where: { id: itemId },
      data: {
        status: 'REJECTED',
        reviewedBy: issuerId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    return { id: itemId, status: 'REJECTED' };
  }

  async issuerFinalApproveRegistry(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId, tx);
      const tc = await this.lockCase(transferCaseId, tx);
      if (tc.status !== 'PAYMENT_CONFIRMED') {
        throw new BadRequestException(
          `Issuer final approval requires PAYMENT_CONFIRMED (got ${tc.status})`,
        );
      }
      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'REGISTER_UPDATE_IN_PROGRESS',
        issuerId,
        'Issuer approved — register update in progress',
        {},
        tx,
      );
      await this.auditService.logTenantAction({
        actorId: issuerId,
        action: AuditAction.REQUEST_STATUS_CHANGE,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: { reference: tc.reference, event: 'issuer_final_approval' },
      });
      return { id: transferCaseId, status: 'REGISTER_UPDATE_IN_PROGRESS' };
    });
  }

  async listBuyerTransferInvitations(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const email = user.email.trim().toLowerCase();
    const invitations = await this.prisma.client.transferInvitation.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        OR: [{ invitedUserId: userId }, { invitedEmail: email }],
      },
      include: {
        transferCase: {
          select: {
            id: true,
            reference: true,
            status: true,
            quantity: true,
            currency: true,
            proposedPrice: true,
            initiationType: true,
            opportunity: {
              select: {
                title: true,
                issuerOrg: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      respondedAt: inv.respondedAt,
      message: inv.message,
      transferCaseId: inv.transferCaseId,
      transferCase: {
        id: inv.transferCase.id,
        reference: inv.transferCase.reference,
        status: inv.transferCase.status,
        initiationType: inv.transferCase.initiationType,
        quantity: inv.transferCase.quantity,
        currency: inv.transferCase.currency,
        proposedPrice: inv.transferCase.proposedPrice,
      },
      issuerName: inv.transferCase.opportunity.issuerOrg?.name ?? null,
      opportunityTitle: inv.transferCase.opportunity.title,
    }));
  }

  async getBuyerTransferInvitationDetail(userId: string, invitationId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const inv = await this.prisma.client.transferInvitation.findUnique({
      where: { id: invitationId },
      include: {
        transferCase: {
          include: {
            opportunity: {
              select: {
                id: true,
                title: true,
                issuerOrg: { select: { name: true } },
              },
            },
            seller: { select: { fullName: true, email: true } },
          },
        },
      },
    });
    if (!inv || inv.tenantId !== user.tenantId) {
      throw new NotFoundException('Invitation not found');
    }

    const emailMatch =
      user.email.trim().toLowerCase() === inv.invitedEmail.trim().toLowerCase();
    const userMatch = inv.invitedUserId === userId;
    if (!userMatch && !emailMatch) {
      throw new ForbiddenException('Not your invitation');
    }

    const docs = await this.prisma.client.opportunityDocument.findMany({
      where: { opportunityId: inv.transferCase.opportunityId },
      select: {
        id: true,
        fileName: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const sellerMasked = `Seller-${createHash('sha256')
      .update(inv.transferCase.sellerId)
      .digest('hex')
      .slice(0, 8)}`;

    return {
      id: inv.id,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      respondedAt: inv.respondedAt,
      message: inv.message,
      transferCaseId: inv.transferCaseId,
      transferCase: {
        id: inv.transferCase.id,
        reference: inv.transferCase.reference,
        status: inv.transferCase.status,
        initiationType: inv.transferCase.initiationType,
        quantity: inv.transferCase.quantity,
        currency: inv.transferCase.currency,
        proposedPrice: inv.transferCase.proposedPrice,
      },
      issuerName: inv.transferCase.opportunity.issuerOrg?.name ?? null,
      opportunityTitle: inv.transferCase.opportunity.title,
      sellerMasked,
      documents: docs.map((d) => ({
        id: d.id,
        title: d.fileName,
        category: d.category,
        createdAt: d.createdAt,
        downloadUrl: `/api/v1/documents/${d.id}/url`,
      })),
    };
  }

  async acceptTransferInvitation(
    tenantId: string,
    userId: string,
    invitationId: string,
    token?: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const inv = await tx.transferInvitation.findUnique({
        where: { id: invitationId },
        include: { transferCase: true },
      });
      if (!inv || inv.tenantId !== tenantId) {
        throw new NotFoundException('Invitation not found');
      }
      if (inv.status !== 'PENDING') {
        throw new BadRequestException(`Invitation is ${inv.status}`);
      }

      // Lock the case to prevent concurrent acceptances or state changes
      const tc = await this.lockCase(inv.transferCaseId, tx);

      if (new Date() > inv.expiresAt) {
        await tx.transferInvitation.update({
          where: { id: invitationId },
          data: { status: 'EXPIRED', respondedAt: new Date() },
        });
        throw new BadRequestException('Invitation expired');
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('User not found');

      if (token) {
        const hash = createHash('sha256').update(token).digest('hex');
        if (hash !== inv.tokenHash) {
          throw new ForbiddenException('Invalid invitation token');
        }
      } else {
        if (user.email.trim().toLowerCase() !== inv.invitedEmail) {
          throw new ForbiddenException(
            'Invitation email does not match your account',
          );
        }
      }

      if (tc.buyerId && tc.buyerId !== userId) {
        throw new BadRequestException('Transfer already has a different buyer');
      }
      if (tc.status !== 'KYC_READY') {
        throw new BadRequestException(
          `Cannot accept invitation — case is ${tc.status}`,
        );
      }

      await tx.transferInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          invitedUserId: userId,
        },
      });

      await tx.transferInvitation.updateMany({
        where: {
          transferCaseId: tc.id,
          id: { not: invitationId },
          status: 'PENDING',
        },
        data: { status: 'REVOKED', respondedAt: new Date() },
      });

      await this.advanceBuyerAttachment(
        tc.id,
        userId,
        tc.status,
        userId,
        'Buyer accepted invitation',
        tx,
      );

      return {
        transferCaseId: tc.id,
        status: (await tx.transferCase.findUnique({ where: { id: tc.id } })).status,
      };
    });
  }

  async declineTransferInvitation(
    tenantId: string,
    userId: string,
    invitationId: string,
  ) {
    const inv = await this.prisma.client.transferInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!inv || inv.tenantId !== tenantId) {
      throw new NotFoundException('Invitation not found');
    }
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    const emailMatch =
      user.email.trim().toLowerCase() === inv.invitedEmail.trim().toLowerCase();
    const userMatch = inv.invitedUserId === userId;
    if (!userMatch && !emailMatch) {
      throw new ForbiddenException('Not your invitation');
    }
    if (inv.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is ${inv.status}`);
    }
    await this.prisma.client.transferInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return { id: invitationId, status: 'DECLINED' };
  }

  async issuerApproveTransfer(
    tenantId: string,
    issuerId: string,
    transferCaseId: string,
    rofrEnabled?: boolean,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertIssuerAccess(transferCaseId, issuerId);
      const tc = await this.lockCase(transferCaseId, tx);

      if (tc.status !== 'MANAGER_REVIEW') {
        throw new BadRequestException(
          `Cannot approve a transfer with status "${tc.status}"`,
        );
      }

      const opportunity = await tx.opportunity.findUnique({
        where: { id: tc.opportunityId },
      });

      const shouldRofr =
        (rofrEnabled ?? true) && (opportunity?.rofrEnabled ?? true);

      if (shouldRofr) {
        await this.triggerRofrWindow(tenantId, tc, issuerId, opportunity, tx);
      } else {
        await this.advanceStatus(
          tc.id,
          tc.status,
          'KYC_READY',
          issuerId,
          'Issuer approved, ROFR skipped',
          {},
          tx,
        );
      }

      const nextStatus = shouldRofr ? 'PRIORITY_WINDOW' : 'KYC_READY';

      await this.notifications.create(
        tenantId,
        tc.sellerId,
        'TRANSFER_UPDATE',
        'Transfer Approved',
        `Your transfer request ${tc.reference} has been approved by the issuer and is now in ${nextStatus} status.`,
      );

      if (nextStatus === 'KYC_READY') {
        await this.maybeAdvanceAfterKycReady(tc.id, issuerId, tx);
      }

      const refreshed = await tx.transferCase.findUnique({ where: { id: tc.id } });
      return { id: tc.id, status: refreshed.status };
    });
  }

  private async triggerRofrWindow(
    tenantId: string,
    tc: any,
    actorId: string,
    opportunity: any,
    tx?: any,
  ) {
    const client = tx ?? this.prisma.client;
    const windowDays = opportunity.rofrWindowDays ?? 14;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + windowDays);

    await this.advanceStatus(
      tc.id,
      tc.status,
      'PRIORITY_WINDOW',
      actorId,
      `ROFR window opened for ${windowDays} days`,
      { priorityWindowExpiresAt: expiresAt },
      tx,
    );

    // Find co-holders (same opportunity, not the seller, active units > 0)
    const coHolders = await client.holding.findMany({
      where: {
        opportunityId: tc.opportunityId,
        tenantId,
        status: 'ACTIVE',
        units: { gt: 0 },
        userId: { not: tc.sellerId },
      },
    });

    for (const h of coHolders) {
      await client.priorityNotice.create({
        data: {
          tenantId,
          transferCaseId: tc.id,
          holderId: h.userId,
          holdingId: h.id,
          status: 'PENDING',
          expiresAt,
        },
      });
    }

    // Schedule BullMQ job to expire the window
    const delayMs = windowDays * 24 * 60 * 60 * 1000;
    await this.jobsService.addJob(
      JOB_NAMES.EXPIRE_PRIORITY_WINDOW,
      { transferCaseId: tc.id, tenantId },
      { delay: delayMs, jobId: `rofr-expire-${tc.id}` },
    );
  }

  private async checkPriorityWindowComplete(transferCaseId: string, tx?: any) {
    const client = tx ?? this.prisma.client;
    const pendingCount = await client.priorityNotice.count({
      where: { transferCaseId, status: 'PENDING' },
    });

    if (pendingCount > 0) return;

    const tc = await this.lockCase(transferCaseId, tx);
    if (tc.status !== 'PRIORITY_WINDOW') return;

    await this.advanceStatus(
      transferCaseId,
      'PRIORITY_WINDOW',
      'KYC_READY',
      null,
      'All priority notices resolved',
      {},
      tx,
    );
    await this.maybeAdvanceAfterKycReady(transferCaseId, null, tx);
  }

  // ─── Admin endpoints ────────────────────────────────────────────────────────

  async listAllTransfers(query: QueryTransfersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const and: Record<string, unknown>[] = [];
    if (query.opportunityId) {
      and.push({ opportunityId: query.opportunityId });
    }
    this.appendTransferListQueryFilters(and, query);
    const where = and.length > 0 ? { AND: and } : {};

    const [data, total] = await Promise.all([
      this.prisma.client.transferCase.findMany({
        where,
        include: {
          opportunity: { select: { title: true } },
          seller: { select: { email: true, fullName: true } },
          buyer: { select: { email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.transferCase.count({ where }),
    ]);

    return {
      data: data.map((tc) => ({
        id: tc.id,
        reference: tc.reference,
        status: tc.status,
        initiationType: tc.initiationType,
        dueAt: tc.dueAt,
        assignedToUserId: tc.assignedToUserId,
        quantity: tc.quantity,
        proposedPrice: tc.proposedPrice,
        currency: tc.currency,
        createdAt: tc.createdAt,
        opportunityTitle: tc.opportunity.title,
        seller: tc.seller,
        buyer: tc.buyer,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminTransferDetail(transferCaseId: string) {
    const tc = await this.prisma.client.transferCase.findUnique({
      where: { id: transferCaseId },
      include: {
        opportunity: {
          select: {
            title: true,
            assetClass: true,
            region: true,
            currency: true,
          },
        },
        seller: { select: { id: true, email: true, fullName: true } },
        buyer: { select: { id: true, email: true, fullName: true } },
        assignedTo: {
          select: { id: true, email: true, fullName: true },
        },
        holding: {
          select: { units: true, acquisitionDate: true, status: true },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        priorityNotices: {
          include: {
            holder: { select: { email: true, fullName: true } },
          },
        },
        registryEntries: { orderBy: { sealedAt: 'asc' } },
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        invitations: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!tc) throw new NotFoundException('Transfer case not found');

    return {
      id: tc.id,
      reference: tc.reference,
      status: tc.status,
      initiationType: tc.initiationType,
      dueAt: tc.dueAt,
      assignedToUserId: tc.assignedToUserId,
      assignedTo: tc.assignedTo,
      quantity: tc.quantity,
      proposedPrice: tc.proposedPrice,
      currency: tc.currency,
      paymentReference: tc.paymentReference,
      paymentConfirmedAt: tc.paymentConfirmedAt,
      registryMutatedAt: tc.registryMutatedAt,
      adminNotes: tc.adminNotes,
      cancelledReason: tc.cancelledReason,
      escalatedReason: tc.escalatedReason,
      rejectedReason: tc.rejectedReason,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt,
      opportunity: tc.opportunity,
      seller: tc.seller,
      buyer: tc.buyer,
      holding: tc.holding,
      statusHistory: tc.statusHistory,
      priorityNotices: tc.priorityNotices.map((n) => ({
        id: n.id,
        status: n.status,
        expiresAt: n.expiresAt,
        respondedAt: n.respondedAt,
        holder: n.holder,
      })),
      registryEntries: tc.registryEntries.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        fromUserId: r.fromUserId,
        toUserId: r.toUserId,
        quantity: r.quantity,
        sealedAt: r.sealedAt,
      })),
      checklistItems: tc.checklistItems.map((c) => ({
        id: c.id,
        itemKey: c.itemKey,
        title: c.title,
        description: c.description,
        required: c.required,
        status: c.status,
        sortOrder: c.sortOrder,
        reviewedAt: c.reviewedAt,
        rejectionReason: c.rejectionReason,
      })),
      invitations: tc.invitations.map((inv) => ({
        id: inv.id,
        invitedEmail: inv.invitedEmail,
        invitedUserId: inv.invitedUserId,
        status: inv.status,
        expiresAt: inv.expiresAt,
        respondedAt: inv.respondedAt,
        message: inv.message,
        createdAt: inv.createdAt,
      })),
    };
  }

  async adminAssignBuyer(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
    buyerId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const tc = await this.lockCase(transferCaseId, tx);

      if (buyerId === tc.sellerId) {
        throw new BadRequestException('Buyer cannot be the seller');
      }

      const buyer = await tx.user.findFirst({
        where: { id: buyerId, tenantId },
      });
      if (!buyer) {
        throw new BadRequestException('Buyer not found in this tenant');
      }

      const allowedInitial = ['KYC_READY'];
      const allowedReassign = [
        'BUYER_VERIFICATION_PENDING',
        'COMPLIANCE_REVIEW',
        'DOCS_PENDING',
      ];

      if (allowedInitial.includes(tc.status)) {
        await this.advanceBuyerAttachment(
          transferCaseId,
          buyerId,
          tc.status,
          adminId,
          'Buyer assigned',
          tx,
        );
      } else if (allowedReassign.includes(tc.status)) {
        await tx.transferCase.update({
          where: { id: transferCaseId },
          data: { buyerId },
        });
        await this.syncBuyerVerificationGate(transferCaseId, adminId, tx);
      } else {
        throw new BadRequestException(
          `Cannot assign buyer in status "${tc.status}"`,
        );
      }

      const next = await this.loadCase(transferCaseId, tx);

      await this.notifications.create(
        tenantId,
        buyerId,
        'TRANSFER_UPDATE',
        'Assigned as Buyer',
        `You have been assigned as the buyer for transfer ${tc.reference}.`,
      );

      return { id: transferCaseId, status: next.status, buyerId };
    });
  }

  async adminMarkDocsComplete(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
  ) {
    const tc = await this.loadCase(transferCaseId);

    if (tc.status !== 'DOCS_PENDING') {
      throw new BadRequestException(
        `Cannot mark docs complete in status "${tc.status}"`,
      );
    }

    const itemCount = await this.prisma.client.transferChecklistItem.count({
      where: { transferCaseId },
    });
    if (itemCount > 0) {
      await this.assertAllRequiredChecklistApproved(transferCaseId);
    }

    await this.advanceStatus(
      transferCaseId,
      tc.status,
      'PAYMENT_PENDING',
      adminId,
      'Documents verified',
      {},
    );

    return { id: transferCaseId, status: 'PAYMENT_PENDING' };
  }

  async adminConfirmPayment(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
    paymentReference: string,
    notes?: string,
  ) {
    const tc = await this.loadCase(transferCaseId);

    if (tc.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException(
        `Cannot confirm payment in status "${tc.status}"`,
      );
    }

    await this.advanceStatus(
      transferCaseId,
      tc.status,
      'PAYMENT_CONFIRMED',
      adminId,
      'Payment confirmed',
      {
        paymentReference,
        paymentConfirmedAt: new Date(),
        paymentConfirmedBy: adminId,
        adminNotes: notes,
      },
    );

    return { id: transferCaseId, status: 'PAYMENT_CONFIRMED' };
  }

  async adminFinalApproveRegistry(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
  ) {
    const tc = await this.loadCase(transferCaseId);
    if (tc.tenantId !== tenantId) {
      throw new ForbiddenException('Transfer case not in tenant');
    }
    if (tc.status !== 'PAYMENT_CONFIRMED') {
      throw new BadRequestException(
        `Final approval requires PAYMENT_CONFIRMED (got ${tc.status})`,
      );
    }
    await this.advanceStatus(
      transferCaseId,
      tc.status,
      'REGISTER_UPDATE_IN_PROGRESS',
      adminId,
      'Final approval — register update in progress (admin)',
      {},
    );
    await this.auditService.logTenantAction({
      actorId: adminId,
      action: AuditAction.REQUEST_STATUS_CHANGE,
      targetType: 'TransferCase',
      targetId: transferCaseId,
      details: { reference: tc.reference, event: 'admin_final_approval' },
    });
    return { id: transferCaseId, status: 'REGISTER_UPDATE_IN_PROGRESS' };
  }

  async adminFinalizeTransfer(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      let tc = await this.lockCase(transferCaseId, tx);

      if (tc.status !== 'REGISTER_UPDATE_IN_PROGRESS') {
        throw new BadRequestException(
          `Cannot finalize a transfer with status "${tc.status}"`,
        );
      }
      await this.assertDistinctFinalApprover(transferCaseId, adminId, tx);
      if (!tc.buyerId) {
        throw new BadRequestException('No buyer assigned');
      }
      await this.assertBuyerCompliance(tc, adminId, tx);

      // Execute atomic registry mutation
      const result = await this.registryEngine.executeTransfer({
        tenantId,
        transferCaseId,
        sellerId: tc.sellerId,
        buyerId: tc.buyerId,
        holdingId: tc.holdingId,
        opportunityId: tc.opportunityId,
        quantity: Number(tc.quantity),
        actorId: adminId,
      });

      // Set to COMPLETED
      await tx.transferCase.update({
        where: { id: transferCaseId },
        data: { status: 'COMPLETED' },
      });

      await this.tokenAdapter.mirrorTransfer({
        tenantId,
        transferCaseId,
        holdingId: result.buyerHoldingId,
        fromUserId: tc.sellerId,
        toUserId: tc.buyerId,
        quantity: Number(tc.quantity),
      });

      await this.auditService.logTenantAction({
        actorId: adminId,
        action: AuditAction.TRANSFER_FINALIZED,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: {
          reference: tc.reference,
          registryEntryId: result.registryEntryId,
          buyerHoldingId: result.buyerHoldingId,
        },
      });

      await this.notifications.create(
        tenantId,
        tc.sellerId,
        'TRANSFER_UPDATE',
        'Transfer Completed',
        `Your transfer ${tc.reference} has been fully completed and settled.`,
      );

      if (tc.buyerId) {
        await this.notifications.create(
          tenantId,
          tc.buyerId,
          'TRANSFER_UPDATE',
          'Transfer Completed',
          `The transfer ${tc.reference} where you are the buyer has been fully completed and settled.`,
        );
      }

      return {
        id: transferCaseId,
        status: 'COMPLETED',
        registryEntryId: result.registryEntryId,
      };
    });
  }

  async adminEscalateTransfer(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
    reason: string,
    tx?: any,
  ) {
    const run = async (t: any) => {
      const tc = await this.lockCase(transferCaseId, t);

      if (this.isTerminalStatus(tc.status) || tc.status === 'ESCALATED') {
        throw new BadRequestException(`Cannot escalate a ${tc.status} transfer`);
      }

      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'ESCALATED',
        adminId,
        reason,
        { escalatedReason: reason },
        t,
      );

      await this.auditService.logTenantAction({
        actorId: adminId,
        action: AuditAction.TRANSFER_ESCALATED,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: { reference: tc.reference, reason },
      });

      return { id: transferCaseId, status: 'ESCALATED' };
    };

    return tx ? run(tx) : this.prisma.client.$transaction(run);
  }

  async adminResolveEscalation(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
    targetStatus: 'MANAGER_REVIEW' | 'COMPLIANCE_REVIEW' | 'DOCS_PENDING',
    notes: string,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const tc = await this.lockCase(transferCaseId, tx);

      if (tc.tenantId !== tenantId) {
        throw new ForbiddenException('Transfer case not found');
      }
      if (tc.status !== 'ESCALATED') {
        throw new BadRequestException('Transfer case is not escalated');
      }

      await this.advanceStatus(
        transferCaseId,
        'ESCALATED',
        targetStatus,
        adminId,
        notes,
        {},
        tx,
      );

      await this.auditService.logTenantAction({
        actorId: adminId,
        action: AuditAction.TRANSFER_ESCALATION_RESOLVED,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: {
          reference: tc.reference,
          from: 'ESCALATED',
          to: targetStatus,
          notes,
        },
      });

      return { id: transferCaseId, status: targetStatus };
    });
  }

  async adminCancelTransfer(
    tenantId: string,
    adminId: string,
    transferCaseId: string,
    reason?: string,
    tx?: any,
  ) {
    const run = async (t: any) => {
      const tc = await this.lockCase(transferCaseId, t);

      if (this.isTerminalStatus(tc.status)) {
        throw new BadRequestException(`Cannot cancel a ${tc.status} transfer`);
      }

      await this.advanceStatus(
        transferCaseId,
        tc.status,
        'CANCELLED',
        adminId,
        reason ?? 'Cancelled by admin',
        { cancelledReason: reason },
        t,
      );

      await this.auditService.logTenantAction({
        actorId: adminId,
        action: AuditAction.TRANSFER_CANCELLED,
        targetType: 'TransferCase',
        targetId: transferCaseId,
        details: { reference: tc.reference, reason },
      });

      return { id: transferCaseId, status: 'CANCELLED' };
    };

    return tx ? run(tx) : this.prisma.client.$transaction(run);
  }

  // ─── BullMQ handler ─────────────────────────────────────────────────────────

  async expirePriorityWindow(transferCaseId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      // Expire all PENDING notices
      await this.prisma.client.priorityNotice.updateMany({
        where: { transferCaseId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      await this.checkPriorityWindowComplete(transferCaseId);
    });
  }
}
