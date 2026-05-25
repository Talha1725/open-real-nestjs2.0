import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { DocumentsService } from '../documents/documents.service.js';
import { S3Service } from '../documents/s3.service.js';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import { UpdateIssuerProfileDto } from './dto/update-issuer-profile.dto.js';
import { QueryIssuerOpportunitiesDto } from './dto/query-issuer-opportunities.dto.js';
import {
  appendStatusHistory,
  buildStatusTimeline,
} from '../common/utils/status-timeline.js';

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

@Injectable()
export class IssuerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async getIssuerOrg(userId: string) {
    const org = await this.prisma.client.issuerOrg.findFirst({
      where: { representativeUserId: userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!org) {
      throw new ForbiddenException('No issuer organisation found for user');
    }
    return org;
  }

  private async getOwnedOpportunity(
    userId: string,
    opportunityId: string,
    issuerOrgId?: string,
  ) {
    const orgId = issuerOrgId ?? (await this.getIssuerOrg(userId)).id;

    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity || opportunity.issuerOrgId !== orgId) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const org = await this.getIssuerOrg(userId);

    const [opportunities, statusCounts] = await Promise.all([
      this.prisma.client.opportunity.findMany({
        where: { issuerOrgId: org.id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          assetClass: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.opportunity.groupBy({
        by: ['status'],
        where: { issuerOrgId: org.id },
        _count: true,
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row._count;
    }

    return {
      organisation: {
        id: org.id,
        name: org.name,
        status: org.status,
      },
      opportunityCounts: counts,
      recentOpportunities: opportunities,
    };
  }

  // ─── Opportunities CRUD ─────────────────────────────────────────────────────

  async listOpportunities(userId: string, query: QueryIssuerOpportunitiesDto) {
    const org = await this.getIssuerOrg(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { issuerOrgId: org.id };
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.opportunity.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          summary: true,
          assetClass: true,
          region: true,
          status: true,
          currency: true,
          minimumAmount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.opportunity.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async createOpportunity(userId: string, dto: CreateOpportunityDto) {
    const org = await this.getIssuerOrg(userId);
    const tenantId = this.tenantContext.getTenantId()!;

    const opportunity = await this.prisma.client.opportunity.create({
      data: {
        tenantId,
        issuerOrgId: org.id,
        title: dto.title,
        summary: dto.summary,
        investmentThesis: dto.investmentThesis ?? '',
        whatYouAreBuying: dto.whatYouAreBuying ?? '',
        risks: dto.risks ?? '',
        feesAndConflicts: dto.feesAndConflicts ?? '',
        faq: dto.faq ?? [],
        assetClass: dto.assetClass as any,
        region: dto.region as any,
        minimumAmount: dto.minimumAmount,
        maximumAmount: dto.maximumAmount,
        currency: dto.currency,
        status: 'DRAFT',
        statusHistory: appendStatusHistory(null, 'DRAFT'),
      },
    });

    return {
      id: opportunity.id,
      title: opportunity.title,
      status: opportunity.status,
      createdAt: opportunity.createdAt,
    };
  }

  async getOpportunity(userId: string, opportunityId: string) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        documents: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            category: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!opportunity || opportunity.issuerOrgId !== org.id) {
      throw new NotFoundException('Opportunity not found');
    }

    let heroImageUrl: string | null = null;
    if (opportunity.heroImageKey) {
      heroImageUrl = await this.s3Service.getSignedDownloadUrl(
        opportunity.heroImageKey,
      );
    }

    return {
      id: opportunity.id,
      title: opportunity.title,
      summary: opportunity.summary,
      investmentThesis: opportunity.investmentThesis,
      whatYouAreBuying: opportunity.whatYouAreBuying,
      risks: opportunity.risks,
      feesAndConflicts: opportunity.feesAndConflicts,
      faq: opportunity.faq,
      assetClass: opportunity.assetClass,
      region: opportunity.region,
      minimumAmount: opportunity.minimumAmount,
      maximumAmount: opportunity.maximumAmount,
      currency: opportunity.currency,
      heroImageUrl,
      status: opportunity.status,
      rejectionReason: opportunity.rejectionReason,
      adminFeedback: opportunity.adminFeedback,
      submittedAt: opportunity.submittedAt,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
      documents: opportunity.documents,
      statusTimeline: buildStatusTimeline(opportunity.statusHistory),
    };
  }

  async updateOpportunity(
    userId: string,
    opportunityId: string,
    dto: UpdateOpportunityDto,
  ) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    if (!EDITABLE_STATUSES.includes(opportunity.status)) {
      throw new BadRequestException(
        `Cannot edit opportunity with status "${opportunity.status}"`,
      );
    }

    const data: any = { ...dto };
    // If editing a REJECTED opportunity, reset it to DRAFT
    if (opportunity.status === 'REJECTED') {
      data.status = 'DRAFT';
      data.rejectionReason = null;
      data.adminFeedback = null;
      data.statusHistory = appendStatusHistory(
        opportunity.statusHistory,
        'DRAFT',
      );
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data,
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  async uploadDocument(
    userId: string,
    opportunityId: string,
    file: Express.Multer.File,
    category?: string,
  ) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    if (!EDITABLE_STATUSES.includes(opportunity.status)) {
      throw new BadRequestException(
        `Cannot upload documents for opportunity with status "${opportunity.status}"`,
      );
    }

    return this.documentsService.upload({
      file,
      entityType: 'opportunity',
      entityId: opportunityId,
      category,
      userId,
    });
  }

  async deleteDocument(
    userId: string,
    opportunityId: string,
    documentId: string,
  ) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    if (opportunity.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only delete documents from DRAFT opportunities',
      );
    }

    // Verify document belongs to this opportunity
    const doc = await this.prisma.client.opportunityDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.opportunityId !== opportunityId) {
      throw new NotFoundException('Document not found');
    }

    await this.documentsService.deleteDocument(documentId);
    return { deleted: true };
  }

  // ─── Hero Image ─────────────────────────────────────────────────────────────

  async uploadHeroImage(
    userId: string,
    opportunityId: string,
    file: Express.Multer.File,
  ) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    if (!EDITABLE_STATUSES.includes(opportunity.status)) {
      throw new BadRequestException(
        `Cannot update hero image for opportunity with status "${opportunity.status}"`,
      );
    }

    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Hero image must be PNG, JPG, JPEG, or WebP',
      );
    }

    const tenantId = this.tenantContext.getTenantId()!;
    const key = this.s3Service.buildKey({
      tenantId,
      entityType: 'opportunity-hero',
      entityId: opportunityId,
      fileName: file.originalname,
    });

    await this.s3Service.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    // Delete old hero image if exists
    if (opportunity.heroImageKey) {
      await this.s3Service.delete(opportunity.heroImageKey).catch(() => {});
    }

    await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: { heroImageKey: key },
    });

    const url = await this.s3Service.getSignedDownloadUrl(key);
    return { heroImageKey: key, heroImageUrl: url };
  }

  // ─── Submit for Review ──────────────────────────────────────────────────────

  async submitForReview(userId: string, opportunityId: string) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    if (opportunity.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot submit opportunity with status "${opportunity.status}". Only DRAFT opportunities can be submitted.`,
      );
    }

    // Validate required fields are filled
    const missing: string[] = [];
    if (!opportunity.title) missing.push('title');
    if (!opportunity.summary) missing.push('summary');
    if (!opportunity.investmentThesis) missing.push('investmentThesis');
    if (!opportunity.whatYouAreBuying) missing.push('whatYouAreBuying');
    if (!opportunity.risks) missing.push('risks');
    if (!opportunity.feesAndConflicts) missing.push('feesAndConflicts');

    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot submit: missing required fields — ${missing.join(', ')}`,
      );
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        statusHistory: appendStatusHistory(
          opportunity.statusHistory,
          'SUBMITTED',
        ),
      },
    });

    await this.auditService.logTenantAction({
      actorId: userId,
      action: AuditAction.OPP_SUBMITTED,
      targetType: 'Opportunity',
      targetId: opportunityId,
      details: { title: opportunity.title, issuerOrgId: org.id },
    });

    return {
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submittedAt,
    };
  }

  // ─── Cap Table ─────────────────────────────────────────────────────────────

  async getCapTable(userId: string, opportunityId: string) {
    const org = await this.getIssuerOrg(userId);
    const opportunity = await this.getOwnedOpportunity(
      userId,
      opportunityId,
      org.id,
    );

    const holdings = await this.prisma.client.holding.findMany({
      where: {
        opportunityId,
        units: { gt: 0 },
      },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { units: 'desc' },
    });

    const totalUnitsIssued = holdings.reduce(
      (sum, h) => sum + Number(h.units),
      0,
    );

    return {
      opportunityId: opportunity.id,
      opportunityName: opportunity.title,
      totalUnitsIssued,
      totalHolders: holdings.length,
      holdings: holdings.map((h) => ({
        holdingId: h.id,
        userId: h.user.id,
        userEmail: h.user.email,
        userFullName: h.user.fullName,
        units: Number(h.units),
        percentageOwnership:
          totalUnitsIssued > 0
            ? Math.round((Number(h.units) / totalUnitsIssued) * 10000) / 100
            : 0,
        acquisitionDate: h.acquisitionDate,
        status: h.status,
      })),
    };
  }

  // ─── Issuer Profile ─────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const org = await this.getIssuerOrg(userId);
    return {
      id: org.id,
      name: org.name,
      registrationNumber: org.registrationNumber,
      countryOfIncorporation: org.countryOfIncorporation,
      status: org.status,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateIssuerProfileDto) {
    const org = await this.getIssuerOrg(userId);

    const updated = await this.prisma.client.issuerOrg.update({
      where: { id: org.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.registrationNumber !== undefined && {
          registrationNumber: dto.registrationNumber,
        }),
        ...(dto.countryOfIncorporation !== undefined && {
          countryOfIncorporation: dto.countryOfIncorporation,
        }),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      registrationNumber: updated.registrationNumber,
      countryOfIncorporation: updated.countryOfIncorporation,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
