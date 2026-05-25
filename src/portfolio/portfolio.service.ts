import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { S3Service } from '../documents/s3.service.js';
import { QueryPortfolioDto } from './dto/query-portfolio.dto.js';
import { CreateDistributionDto } from './dto/create-distribution.dto.js';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly s3: S3Service,
  ) {}

  // ─── Investor endpoints ──────────────────────────────────────────────────────

  async getPortfolio(userId: string, query: QueryPortfolioDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const [holdings, total] = await Promise.all([
      this.prisma.client.holding.findMany({
        where,
        include: {
          opportunity: {
            select: {
              title: true,
              assetClass: true,
              region: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.holding.count({ where }),
    ]);

    // KPIs
    const [activeHoldings, paidDistributions, pendingRequests] =
      await Promise.all([
        this.prisma.client.holding.findMany({
          where: { userId, status: 'ACTIVE' },
          select: { units: true },
        }),
        this.prisma.client.distribution.findMany({
          where: {
            holding: { userId },
            status: 'PAID',
          },
          select: { amount: true },
        }),
        this.prisma.client.investmentRequest.count({
          where: {
            userId,
            status: {
              in: ['REQUEST_CREATED', 'PENDING_PAYMENT_CONFIRMATION'],
            },
          },
        }),
      ]);

    const totalValue = activeHoldings.reduce(
      (sum, h) => sum + Number(h.units),
      0,
    );
    const totalDistributions = paidDistributions.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );

    return {
      kpis: {
        totalHoldings: activeHoldings.length,
        totalValue,
        totalDistributions,
        pendingRequests,
      },
      holdings: holdings.map((h) => ({
        id: h.id,
        units: h.units,
        acquisitionDate: h.acquisitionDate,
        status: h.status,
        createdAt: h.createdAt,
        opportunity: h.opportunity,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getHoldingDetail(holdingId: string, userId: string) {
    const holding = await this.prisma.client.holding.findFirst({
      where: { id: holdingId, userId },
      include: {
        opportunity: {
          select: {
            title: true,
            summary: true,
            assetClass: true,
            region: true,
            currency: true,
            heroImageKey: true,
          },
        },
        investmentRequest: {
          select: {
            referenceNumber: true,
            amount: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    });

    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    let heroImageUrl: string | null = null;
    if (holding.opportunity.heroImageKey) {
      try {
        heroImageUrl = await this.s3.getSignedDownloadUrl(
          holding.opportunity.heroImageKey,
        );
      } catch {
        heroImageUrl = null;
      }
    }

    return {
      id: holding.id,
      units: holding.units,
      acquisitionDate: holding.acquisitionDate,
      status: holding.status,
      createdAt: holding.createdAt,
      opportunity: {
        title: holding.opportunity.title,
        summary: holding.opportunity.summary,
        assetClass: holding.opportunity.assetClass,
        region: holding.opportunity.region,
        currency: holding.opportunity.currency,
        heroImageUrl,
      },
      investmentRequest: holding.investmentRequest,
    };
  }

  async getDistributions(holdingId: string, userId: string) {
    this.checkFeatureFlag('portfolio_distributions');

    const holding = await this.prisma.client.holding.findFirst({
      where: { id: holdingId, userId },
    });
    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    return await this.prisma.client.distribution.findMany({
      where: { holdingId },
      orderBy: { distributionDate: 'desc' },
    });
  }

  async getHoldingDocuments(holdingId: string, userId: string) {
    this.checkFeatureFlag('portfolio_statements');

    const holding = await this.prisma.client.holding.findFirst({
      where: { id: holdingId, userId },
    });
    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    const statements = await this.prisma.client.statement.findMany({
      where: { holdingId },
      orderBy: { createdAt: 'desc' },
    });

    return await Promise.all(
      statements.map(async (s) => {
        let url: string | null = null;
        try {
          url = await this.s3.getSignedDownloadUrl(s.fileKey);
        } catch {
          url = null;
        }
        return {
          id: s.id,
          type: s.type,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          url,
          createdAt: s.createdAt,
        };
      }),
    );
  }

  // ─── Admin endpoints ─────────────────────────────────────────────────────────

  async createDistribution(
    holdingId: string,
    dto: CreateDistributionDto,
    actorId: string,
  ) {
    const tenantId = this.tenantContext.getTenantId()!;

    const holding = await this.prisma.client.holding.findUnique({
      where: { id: holdingId },
    });
    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    const distribution = await this.prisma.client.distribution.create({
      data: {
        tenantId,
        holdingId,
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency,
        distributionDate: new Date(dto.distributionDate),
        status: dto.status ?? 'PENDING',
      },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.DISTRIBUTION_CREATED,
      targetType: 'Distribution',
      targetId: distribution.id,
      details: {
        holdingId,
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency,
      },
    });

    return distribution;
  }

  async uploadStatement(
    holdingId: string,
    file: Express.Multer.File,
    dto: { type: string; periodStart?: string; periodEnd?: string },
    actorId: string,
  ) {
    const tenantId = this.tenantContext.getTenantId()!;

    const holding = await this.prisma.client.holding.findUnique({
      where: { id: holdingId },
    });
    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    const key = this.s3.buildKey({
      tenantId,
      entityType: 'statement',
      entityId: holdingId,
      fileName: file.originalname,
    });

    await this.s3.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    const statement = await this.prisma.client.statement.create({
      data: {
        tenantId,
        holdingId,
        type: dto.type,
        fileKey: key,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
      },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.STATEMENT_UPLOADED,
      targetType: 'Statement',
      targetId: statement.id,
      details: { holdingId, type: dto.type, fileKey: key },
    });

    return {
      id: statement.id,
      type: statement.type,
      fileKey: statement.fileKey,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      createdAt: statement.createdAt,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private checkFeatureFlag(flag: string) {
    const config = this.tenantContext.getTenantConfig();
    const features = config?.features ?? {};
    if (features[flag] !== true) {
      throw new ForbiddenException('This feature is not available');
    }
  }
}
