import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { EmailService } from '../notifications/email.service.js';
import { RedisService } from '../redis/redis.service.js';
import { S3Service } from '../documents/s3.service.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';
import { flattenBranding } from '../tenants/tenants.service.js';
import { QueryAuditLogsDto } from '../audit/dto/query-audit-logs.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { QueryOpportunityReviewDto } from './dto/query-opportunity-review.dto.js';
import { OpportunityRejectDto } from './dto/opportunity-reject.dto.js';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { UpdateBrandingDto } from './dto/update-branding.dto.js';
import {
  appendStatusHistory,
  buildStatusTimeline,
} from '../common/utils/status-timeline.js';
import { UpdateLegalDto } from './dto/update-legal.dto.js';
import { UpdateSupportDto } from './dto/update-support.dto.js';
import { UpdateIntegrationsDto } from './dto/update-integrations.dto.js';
import { UpdateWorkflowsDto } from './dto/update-workflows.dto.js';
import { ExportAuditLogsDto } from './dto/export-audit-logs.dto.js';
import { JobsService } from '../jobs/jobs.service.js';
import { JOB_NAMES } from '../jobs/jobs.constants.js';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  emailVerified: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class TenantAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
    private readonly s3Service: S3Service,
    private readonly jobsService: JobsService,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── User Management (existing) ──────────────────────────────────────────────

  private toSafeUser(user: any): any {
    if (!user) return user;
    return {
      ...user,
      fullName: this.encryption.decrypt(user.fullName),
      phone: user.phone ? this.encryption.decrypt(user.phone) : null,
    };
  }

  async listUsers(query: QueryUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      data: data.map((u) => this.toSafeUser(u)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(userId: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
      select: {
        ...SAFE_USER_SELECT,
        _count: {
          select: {
            investmentRequests: true,
            holdings: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toSafeUser(user);
  }

  async createUser(dto: CreateUserDto, actorId: string) {
    if (dto.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot create SUPER_ADMIN users');
    }

    const tenantId = this.tenantContext.getTenantId();

    const existing = await this.prisma.client.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenantId!,
        email: dto.email,
        passwordHash,
        fullName: this.encryption.encrypt(dto.fullName),
        role: dto.role,
        phone: dto.phone ? this.encryption.encrypt(dto.phone) : null,
        emailVerified: dto.emailVerified ?? false,
        status: 'ACTIVE',
      },
      select: SAFE_USER_SELECT,
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.USER_CREATED_BY_ADMIN,
      targetType: 'User',
      targetId: user.id,
      details: { email: dto.email, role: dto.role, createdBy: actorId },
    });

    await this.emailService.sendAccountCreatedByAdmin({
      to: dto.email,
      fullName: dto.fullName,
      tempPassword: dto.password,
    });

    return this.toSafeUser(user);
  }

  async updateUser(userId: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }

    if (userId === actorId && dto.role !== undefined) {
      throw new BadRequestException('Cannot change your own role');
    }

    if (user.role === 'ADMIN' && userId !== actorId) {
      throw new ForbiddenException('Cannot modify other admin users');
    }

    const data: any = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.fullName !== undefined) data.fullName = this.encryption.encrypt(dto.fullName);
    if (dto.phone !== undefined) data.phone = dto.phone ? this.encryption.encrypt(dto.phone) : null;
    if (dto.emailVerified !== undefined) data.emailVerified = dto.emailVerified;

    if (dto.role !== undefined && dto.role !== user.role) {
      await this.audit.logTenantAction({
        actorId,
        action: AuditAction.USER_ROLE_CHANGE,
        targetType: 'User',
        targetId: userId,
        details: { from: user.role, to: dto.role },
      });
    }

    if (dto.status === 'SUSPENDED' && user.status !== 'SUSPENDED') {
      await this.audit.logTenantAction({
        actorId,
        action: AuditAction.USER_SUSPENDED,
        targetType: 'User',
        targetId: userId,
      });
    }

    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data,
      select: SAFE_USER_SELECT,
    });

    return this.toSafeUser(updated);
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard() {
    const [
      pendingKyc,
      pendingKyb,
      pendingOpportunities,
      activeRequests,
      totalUsers,
      activeHoldings,
      recentActivity,
    ] = await Promise.all([
      this.prisma.client.verification.count({
        where: { status: 'PENDING_REVIEW' },
      }),
      this.prisma.client.kYBApplication.count({
        where: { status: 'SUBMITTED' },
      }),
      this.prisma.client.opportunity.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      }),
      this.prisma.client.investmentRequest.count({
        where: {
          status: { in: ['REQUEST_CREATED', 'PENDING_PAYMENT_CONFIRMATION'] },
        },
      }),
      this.prisma.client.user.count(),
      this.prisma.client.holding.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { units: true },
      }),
      this.prisma.client.auditLogEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          actor: { select: { email: true, fullName: true } },
        },
      }),
    ]);

    return {
      kpis: {
        pendingKyc,
        pendingKyb,
        pendingOpportunities,
        activeRequests,
        totalUsers,
        totalHoldingsValue: activeHoldings._sum.units ?? 0,
      },
      recentActivity: recentActivity.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        actor: e.actor,
        createdAt: e.createdAt,
      })),
    };
  }

  // ─── Opportunity Review ─────────────────────────────────────────────────────

  async listOpportunitiesForReview(query: QueryOpportunityReviewDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { in: ['SUBMITTED', 'UNDER_REVIEW'] };
    }

    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.opportunity.findMany({
        where,
        include: {
          issuerOrg: { select: { name: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.opportunity.count({ where }),
    ]);

    return {
      data: data.map((o) => ({
        id: o.id,
        title: o.title,
        summary: o.summary,
        assetClass: o.assetClass,
        region: o.region,
        status: o.status,
        issuerOrg: o.issuerOrg,
        submittedAt: o.submittedAt,
        createdAt: o.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOpportunityForReview(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        issuerOrg: {
          select: {
            name: true,
            registrationNumber: true,
            countryOfIncorporation: true,
          },
        },
        documents: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            category: true,
            createdAt: true,
            fileKey: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    let heroImageUrl: string | null = null;
    if (opportunity.heroImageKey) {
      heroImageUrl = await this.s3Service.getSignedDownloadUrl(
        opportunity.heroImageKey,
      );
    }

    const documents = await Promise.all(
      opportunity.documents.map(async (doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        category: doc.category,
        createdAt: doc.createdAt,
        url: await this.s3Service.getSignedDownloadUrl(doc.fileKey),
      })),
    );

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
      approvedAt: opportunity.approvedAt,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
      issuerOrg: opportunity.issuerOrg,
      documents,
      statusTimeline: buildStatusTimeline(opportunity.statusHistory),
    };
  }

  async approveOpportunity(opportunityId: string, actorId: string) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        issuerOrg: {
          include: {
            representativeUser: {
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    if (
      opportunity.status !== 'SUBMITTED' &&
      opportunity.status !== 'UNDER_REVIEW'
    ) {
      throw new BadRequestException(
        `Cannot approve opportunity with status "${opportunity.status}"`,
      );
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'LIVE',
        approvedAt: new Date(),
        reviewedBy: actorId,
        rejectionReason: null,
        adminFeedback: null,
        statusHistory: appendStatusHistory(opportunity.statusHistory, 'LIVE'),
      },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.OPP_APPROVED,
      targetType: 'Opportunity',
      targetId: opportunityId,
      details: { title: opportunity.title },
    });

    const rep = opportunity.issuerOrg.representativeUser;
    await this.emailService.sendOpportunityApproved({
      to: rep.email,
      fullName: rep.fullName,
      opportunityTitle: opportunity.title,
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      approvedAt: updated.approvedAt,
    };
  }

  async rejectOpportunity(
    opportunityId: string,
    dto: OpportunityRejectDto,
    actorId: string,
  ) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        issuerOrg: {
          include: {
            representativeUser: {
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    if (
      opportunity.status !== 'SUBMITTED' &&
      opportunity.status !== 'UNDER_REVIEW'
    ) {
      throw new BadRequestException(
        `Cannot reject opportunity with status "${opportunity.status}"`,
      );
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'REJECTED',
        reviewedBy: actorId,
        rejectionReason: dto.feedback,
        adminFeedback: dto.feedback,
        statusHistory: appendStatusHistory(
          opportunity.statusHistory,
          'REJECTED',
        ),
      },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.OPP_REJECTED,
      targetType: 'Opportunity',
      targetId: opportunityId,
      details: { title: opportunity.title, feedback: dto.feedback },
    });

    const rep = opportunity.issuerOrg.representativeUser;
    await this.emailService.sendOpportunityRejected({
      to: rep.email,
      fullName: rep.fullName,
      opportunityTitle: opportunity.title,
      feedback: dto.feedback,
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
    };
  }

  async requestChangesOpportunity(
    opportunityId: string,
    dto: OpportunityRejectDto,
    actorId: string,
  ) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        issuerOrg: {
          include: {
            representativeUser: {
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    if (
      opportunity.status !== 'SUBMITTED' &&
      opportunity.status !== 'UNDER_REVIEW'
    ) {
      throw new BadRequestException(
        `Cannot request changes for opportunity with status "${opportunity.status}"`,
      );
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'CHANGES_REQUESTED',
        reviewedBy: actorId,
        adminFeedback: dto.feedback,
        statusHistory: appendStatusHistory(
          opportunity.statusHistory,
          'CHANGES_REQUESTED',
        ),
      },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.OPP_CHANGES_REQUESTED,
      targetType: 'Opportunity',
      targetId: opportunityId,
      details: { title: opportunity.title, feedback: dto.feedback },
    });

    const rep = opportunity.issuerOrg.representativeUser;
    await this.emailService.sendOpportunityChangesRequested({
      to: rep.email,
      fullName: rep.fullName,
      opportunityTitle: opportunity.title,
      feedback: dto.feedback,
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      adminFeedback: updated.adminFeedback,
    };
  }

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  async getAuditLogs(query: QueryAuditLogsDto) {
    const tenantId = this.tenantContext.getTenantId()!;
    return this.audit.query(tenantId, query);
  }

  async exportAuditLogs(query: QueryAuditLogsDto, actorId: string) {
    const tenantId = this.tenantContext.getTenantId()!;
    const rows = await this.audit.export(tenantId, query, actorId);

    // Fetch actor emails for all unique actorIds
    const actorIds = [...new Set(rows.map((r: any) => r.actorId))];
    const actors = await this.prisma.client.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a.email]));

    const header = 'Timestamp,Actor,Action,Target Type,Target ID,Details';
    const lines = rows.map((r: any) => {
      const ts =
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt;
      const actor = actorMap.get(r.actorId) ?? r.actorId;
      const details = r.details
        ? JSON.stringify(r.details).replace(/"/g, '""')
        : '';
      return `"${ts}","${actor}","${r.action}","${r.targetType ?? ''}","${r.targetId ?? ''}","${details}"`;
    });

    return [header, ...lines].join('\n');
  }

  async queueAuditExport(
    dto: ExportAuditLogsDto,
    actorId: string,
  ): Promise<{ message: string; jobId: string }> {
    if (!dto.confirmExport) {
      throw new BadRequestException('confirmExport must be true');
    }

    const tenantId = this.tenantContext.getTenantId()!;

    const job = await this.jobsService.addJob(JOB_NAMES.AUDIT_LOG_EXPORT, {
      tenantId,
      requestedBy: actorId,
      format: dto.format,
      filters: {
        startDate: dto.startDate,
        endDate: dto.endDate,
        action: dto.action,
        actorId: dto.actorId,
      },
    });

    return {
      message:
        'Export is being generated. You will receive an email with the download link.',
      jobId: job.id!,
    };
  }

  // ─── Tenant Settings ────────────────────────────────────────────────────────

  async getSettings() {
    const tenantId = this.tenantContext.getTenantId()!;
    const config = await this.prisma.client.tenantConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return {
        branding: {},
        legal: {},
        support: {},
        email: {},
        features: {},
        integrations: {},
        workflows: {},
      };
    }

    const branding = await this.resolveBrandingLogos(
      flattenBranding(
        typeof config.branding === 'object' && config.branding !== null
          ? (config.branding as Record<string, any>)
          : {},
      ),
    );

    let integrations = config.integrations;
    if (integrations && typeof integrations === 'string') {
      integrations = this.encryption.decryptJson(integrations);
    }

    return {
      branding,
      legal: config.legal,
      support: config.support,
      email: config.email,
      features: config.features,
      integrations,
      workflows: config.workflows,
    };
  }

  async updateBranding(dto: UpdateBrandingDto, actorId: string) {
    // Flatten legacy nested branding before merging new flat fields
    const saved = await this.updateConfigSection(
      'branding',
      dto,
      actorId,
      true,
    );
    return this.resolveBrandingLogos(
      typeof saved === 'object' && saved !== null
        ? (saved as Record<string, any>)
        : {},
    );
  }

  private static readonly LOGO_TYPES = [
    'primary',
    'monochrome',
    'favicon',
  ] as const;
  private static readonly LOGO_MIME_TYPES = [
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ];
  private static readonly LOGO_KEY_MAP: Record<string, string> = {
    primary: 'logoPrimary',
    monochrome: 'logoMonochrome',
    favicon: 'logoFavicon',
  };

  async uploadLogo(
    file: Express.Multer.File,
    logoType: string,
    actorId: string,
  ) {
    if (
      !TenantAdminService.LOGO_TYPES.includes(
        logoType as (typeof TenantAdminService.LOGO_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Invalid logo type "${logoType}". Must be one of: ${TenantAdminService.LOGO_TYPES.join(', ')}`,
      );
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!TenantAdminService.LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: SVG, PNG, JPG`,
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 2MB');
    }

    const tenantId = this.tenantContext.getTenantId()!;
    const ext = extname(file.originalname) || '.png';
    const s3Key = `${tenantId}/branding/${logoType}-${randomUUID()}${ext}`;

    await this.s3Service.upload({
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    // Update branding JSON with the new logo key
    const brandingKey = TenantAdminService.LOGO_KEY_MAP[logoType];
    let config = await this.prisma.client.tenantConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.client.tenantConfig.create({
        data: { tenantId },
      });
    }

    const branding =
      typeof config.branding === 'object' && config.branding !== null
        ? (config.branding as Record<string, any>)
        : {};

    branding[brandingKey] = s3Key;

    await this.prisma.client.tenantConfig.update({
      where: { tenantId },
      data: { branding },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.TENANT_SETTINGS_UPDATED,
      targetType: 'TenantConfig',
      targetId: tenantId,
      details: { section: 'branding', logo: logoType },
    });

    await this.invalidateTenantCache();

    return { logoType, fileKey: s3Key, message: 'Logo uploaded' };
  }

  async updateLegal(dto: UpdateLegalDto, actorId: string) {
    return this.updateConfigSection('legal', dto, actorId);
  }

  async updateSupport(dto: UpdateSupportDto, actorId: string) {
    return this.updateConfigSection('support', dto, actorId);
  }

  async updateIntegrations(dto: UpdateIntegrationsDto, actorId: string) {
    return this.updateConfigSection('integrations', dto, actorId);
  }

  async updateWorkflows(dto: UpdateWorkflowsDto, actorId: string) {
    return this.updateConfigSection('workflows', dto, actorId);
  }

  private async updateConfigSection(
    section: string,
    dto: Record<string, any>,
    actorId: string,
    flatten = false,
  ) {
    const tenantId = this.tenantContext.getTenantId()!;

    let config = await this.prisma.client.tenantConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.client.tenantConfig.create({
        data: { tenantId },
      });
    }

    const raw = config[section] ?? {};
    let existing = raw;
    if (typeof raw === 'string' && raw.startsWith('enc:')) {
      existing = this.encryption.decryptJson(raw);
    }
    if (flatten && typeof existing === 'object' && existing !== null) {
      existing = flattenBranding(existing as Record<string, any>);
    }

    // Build merged value: strip undefined keys from dto, handle overrides
    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && key !== 'overrides') {
        changes[key] = value;
      }
    }

    let merged = { ...existing, ...changes };

    // Deep merge overrides if present
    if (dto.overrides && typeof dto.overrides === 'object') {
      merged = { ...merged, ...dto.overrides };
    }

    let valueToSave = merged;
    if (section === 'integrations') {
      valueToSave = this.encryption.encryptJson(merged) as any;
    }

    const updated = await this.prisma.client.tenantConfig.update({
      where: { tenantId },
      data: { [section]: valueToSave },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.TENANT_SETTINGS_UPDATED,
      targetType: 'TenantConfig',
      targetId: tenantId,
      details: { section, changes: dto },
    });

    await this.invalidateTenantCache();

    return updated[section];
  }

  private async resolveBrandingLogos(
    flat: Record<string, any>,
  ): Promise<Record<string, any>> {
    const out = { ...flat };
    for (const key of ['logoPrimary', 'logoMonochrome', 'logoFavicon']) {
      const raw = out[key] as string | undefined;
      out[`${key}Url`] = await this.resolveLogoUrl(raw ?? '');
    }
    return out;
  }

  private async resolveLogoUrl(value: string): Promise<string | null> {
    if (!value) return null;
    if (value.startsWith('http')) return value;
    if (value.startsWith('/')) return value;
    if (value.includes('/')) {
      try {
        return await this.s3Service.getSignedDownloadUrl(value);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async invalidateTenantCache(): Promise<void> {
    try {
      const tenantId = this.tenantContext.getTenantId();
      if (!tenantId) return;

      // Look up full tenant to get ALL domains (primary + additional)
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { domain: true, additionalDomains: true },
      });
      if (!tenant) return;

      const domains = [
        tenant.domain,
        ...((tenant.additionalDomains as string[]) ?? []),
      ];

      await Promise.all(
        domains.map((d) =>
          this.redis.del(`tenant:domain:${this.normalizeDomainCacheKey(d)}`),
        ),
      );
    } catch {
      // Silently ignore cache invalidation failures
    }
  }

  private normalizeDomainCacheKey(domain: string): string {
    let normalized = domain.trim().toLowerCase();
    if (normalized.startsWith('www.')) {
      normalized = normalized.slice(4);
    }
    return normalized;
  }

  // ─── Feature Config ─────────────────────────────────────────────────────────

  async getFeatureConfig(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, featureConfig: true },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const defaults = {
      primaryIssueEnabled: true,
      transferRequestEnabled: false,
      secondaryMarketEnabled: false,
      liquidityMode: 'none',
      tokenState: 'none',
      settlementMode: 'manual_external_confirm',
      surveillanceRequired: false,
      investorCategoryRuleset: '',
    };

    return {
      opportunityId: opportunity.id,
      featureConfig: {
        ...defaults,
        ...((opportunity.featureConfig as Record<string, any>) ?? {}),
      },
    };
  }

  async updateFeatureConfig(
    opportunityId: string,
    dto: Record<string, any>,
    actorId: string,
  ) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, featureConfig: true },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const existing = (opportunity.featureConfig as Record<string, any>) ?? {};
    const merged = { ...existing };
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    const updated = await this.prisma.client.opportunity.update({
      where: { id: opportunityId },
      data: { featureConfig: merged },
      select: { id: true, featureConfig: true },
    });

    await this.audit.logTenantAction({
      actorId,
      action: AuditAction.TENANT_SETTINGS_UPDATED,
      targetType: 'Opportunity',
      targetId: opportunityId,
      details: { section: 'featureConfig', changes: dto },
    });

    return {
      opportunityId: updated.id,
      featureConfig: updated.featureConfig,
    };
  }

  // ─── Cap Table ─────────────────────────────────────────────────────────────

  async getCapTable(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, title: true },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

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

  // ─── Reports ────────────────────────────────────────────────────────────────

  async getReports() {
    const [
      usersByRole,
      usersByStatus,
      opportunitiesByStatus,
      opportunitiesByAssetClass,
      requestsByStatus,
      requestAmountsByStatus,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.client.user.groupBy({
        by: ['role'],
        _count: true,
      }),
      this.prisma.client.user.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.client.opportunity.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.client.opportunity.groupBy({
        by: ['assetClass'],
        _count: true,
      }),
      this.prisma.client.investmentRequest.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.client.investmentRequest.groupBy({
        by: ['status'],
        _sum: { amount: true },
      }),
      this.getMonthlyRegistrations(),
    ]);

    return {
      users: {
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count])),
        byStatus: Object.fromEntries(
          usersByStatus.map((r) => [r.status, r._count]),
        ),
        registrationsPerMonth: recentRegistrations,
      },
      opportunities: {
        byStatus: Object.fromEntries(
          opportunitiesByStatus.map((r) => [r.status, r._count]),
        ),
        byAssetClass: Object.fromEntries(
          opportunitiesByAssetClass.map((r) => [r.assetClass, r._count]),
        ),
      },
      investmentRequests: {
        byStatus: Object.fromEntries(
          requestsByStatus.map((r) => [r.status, r._count]),
        ),
        amountByStatus: Object.fromEntries(
          requestAmountsByStatus.map((r) => [r.status, r._sum.amount ?? 0]),
        ),
      },
    };
  }

  private async getMonthlyRegistrations() {
    const months: { month: string; count: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = await this.prisma.client.user.count({
        where: {
          createdAt: { gte: start, lt: end },
        },
      });
      const label = start.toISOString().slice(0, 7); // YYYY-MM
      months.push({ month: label, count });
    }

    return months;
  }
}
