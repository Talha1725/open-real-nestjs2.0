import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { UpdateFeaturesDto } from './dto/update-features.dto.js';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto.js';
import { CreateUserDto } from '../tenant-admin/dto/create-user.dto.js';
import { EmailService } from '../notifications/email.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { S3Service } from '../documents/s3.service.js';
import { QueryPlatformLogsDto } from './dto/query-platform-logs.dto.js';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly jobsService: JobsService,
    private readonly s3: S3Service,
  ) {}

  // ─── Dashboard ──────────────────────────────────────────────

  async getDashboard() {
    return this.prisma.bypassTenantScoping(async () => {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalUsers,
        totalOpportunities,
        totalInvestmentRequests,
      ] = await Promise.all([
        this.prisma.client.tenant.count(),
        this.prisma.client.tenant.count({ where: { status: 'ACTIVE' } }),
        this.prisma.client.tenant.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.client.user.count(),
        this.prisma.client.opportunity.count(),
        this.prisma.client.investmentRequest.count(),
      ]);

      return {
        tenants: {
          total: totalTenants,
          active: activeTenants,
          suspended: suspendedTenants,
        },
        users: { total: totalUsers },
        opportunities: { total: totalOpportunities },
        investmentRequests: { total: totalInvestmentRequests },
      };
    });
  }

  // ─── Tenant CRUD ────────────────────────────────────────────

  async listTenants() {
    return this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          domain: true,
          status: true,
          featureTier: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async createTenant(dto: CreateTenantDto, actorId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      // Check slug uniqueness
      const existingSlug = await this.prisma.client.tenant.findFirst({
        where: { slug: dto.slug },
      });
      if (existingSlug) {
        throw new ConflictException('Tenant slug already exists');
      }

      // Validate all domains are available
      await this.validateDomainAvailability(dto.domain);
      for (const d of dto.additionalDomains ?? []) {
        await this.validateDomainAvailability(d);
      }

      // Create tenant
      const tenant = await this.prisma.client.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          domain: dto.domain,
          additionalDomains: dto.additionalDomains ?? [],
          status: 'ACTIVE',
          featureTier: dto.featureTier,
        },
      });

      // Create default config
      await this.prisma.client.tenantConfig.create({
        data: {
          tenantId: tenant.id,
          branding: {},
          legal: {},
          support: {},
          email: {},
          features: this.getDefaultFeatures(dto.featureTier),
          integrations: { kycProvider: 'sumsub' },
          workflows: { requestExpiryDays: 7, maxFileUploadMB: 10 },
        },
      });

      // Create admin user
      const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
      const admin = await this.prisma.client.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.adminEmail,
          passwordHash,
          fullName: dto.adminName,
          role: 'ADMIN',
          emailVerified: true,
          status: 'ACTIVE',
        },
      });

      // Audit log
      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.TENANT_CREATED,
        targetType: 'Tenant',
        targetId: tenant.id,
        targetTenantId: tenant.id,
        details: {
          tenantName: dto.name,
          domain: dto.domain,
          adminEmail: dto.adminEmail,
        },
      });

      // Invalidate cache
      await this.redis.del(
        `tenant:domain:${this.normalizeDomainCacheKey(dto.domain)}`,
      );

      await this.emailService.sendAccountCreatedByAdmin({
        to: dto.adminEmail,
        fullName: dto.adminName,
        tempPassword: dto.adminPassword,
      });

      this.logger.log(`Tenant created: ${tenant.name}`);

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          domain: tenant.domain,
          status: tenant.status,
          featureTier: tenant.featureTier,
          createdAt: tenant.createdAt,
        },
        adminEmail: admin.email,
      };
    });
  }

  async getTenant(tenantId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        include: { config: true },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const [userCount, opportunityCount, investmentRequestCount] =
        await Promise.all([
          this.prisma.client.user.count({ where: { tenantId } }),
          this.prisma.client.opportunity.count({ where: { tenantId } }),
          this.prisma.client.investmentRequest.count({ where: { tenantId } }),
        ]);

      return {
        ...tenant,
        _counts: {
          users: userCount,
          opportunities: opportunityCount,
          investmentRequests: investmentRequestCount,
        },
      };
    });
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto, actorId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const existing = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!existing) {
        throw new NotFoundException('Tenant not found');
      }

      // Capture old domains BEFORE updating (for cache invalidation)
      const oldDomains = [
        existing.domain,
        ...((existing.additionalDomains as string[]) ?? []),
      ];

      // Validate domain uniqueness (exclude self)
      if (dto.domain && dto.domain !== existing.domain) {
        await this.validateDomainAvailability(dto.domain, tenantId);
      }
      if (dto.additionalDomains) {
        for (const d of dto.additionalDomains) {
          await this.validateDomainAvailability(d, tenantId);
        }
      }

      const updated = await this.prisma.client.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.domain !== undefined && { domain: dto.domain }),
          ...(dto.additionalDomains !== undefined && {
            additionalDomains: dto.additionalDomains,
          }),
          ...(dto.featureTier !== undefined && {
            featureTier: dto.featureTier,
          }),
        },
      });

      // Audit log
      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.SUPERADMIN_ACTION,
        targetType: 'Tenant',
        targetId: tenantId,
        targetTenantId: tenantId,
        details: { action: 'update_tenant', changes: dto },
      });

      // If featureTier changed, reset features to new tier defaults
      if (dto.featureTier && dto.featureTier !== existing.featureTier) {
        const updatedFeatures = this.getDefaultFeatures(dto.featureTier);
        await this.prisma.client.tenantConfig.update({
          where: { tenantId },
          data: { features: updatedFeatures },
        });
      }

      // Invalidate Redis cache for ALL affected domains (old + new)
      const newDomains = [
        updated.domain,
        ...((updated.additionalDomains as string[]) ?? []),
      ];
      const allDomains = [...new Set([...oldDomains, ...newDomains])];
      await Promise.all(
        allDomains.map((d) =>
          this.redis.del(`tenant:domain:${this.normalizeDomainCacheKey(d)}`),
        ),
      );

      return updated;
    });
  }

  // ─── Features ───────────────────────────────────────────────

  async updateFeatures(
    tenantId: string,
    dto: UpdateFeaturesDto,
    actorId: string,
  ) {
    return this.prisma.bypassTenantScoping(async () => {
      const config = await this.prisma.client.tenantConfig.findUnique({
        where: { tenantId },
      });
      if (!config) {
        throw new NotFoundException('Tenant config not found');
      }

      const existingFeatures =
        typeof config.features === 'object' && config.features !== null
          ? (config.features as Record<string, boolean>)
          : {};
      const mergedFeatures = { ...existingFeatures, ...dto.features };

      const updated = await this.prisma.client.tenantConfig.update({
        where: { tenantId },
        data: { features: mergedFeatures },
      });

      // Audit log
      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.FEATURES_UPDATED,
        targetType: 'TenantConfig',
        targetId: tenantId,
        targetTenantId: tenantId,
        details: { tenantId, features: dto.features },
      });

      // Invalidate cache
      await this.invalidateTenantCache(tenantId);

      return { features: updated.features };
    });
  }

  // ─── Suspend / Reactivate ───────────────────────────────────

  async suspendTenant(tenantId: string, actorId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      if (tenant.status !== 'ACTIVE') {
        throw new BadRequestException('Only active tenants can be suspended');
      }

      const updated = await this.prisma.client.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });

      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.TENANT_SUSPENDED,
        targetType: 'Tenant',
        targetId: tenantId,
        targetTenantId: tenantId,
      });

      await this.invalidateTenantCache(tenantId);

      return { message: 'Tenant suspended', tenant: updated };
    });
  }

  async reactivateTenant(tenantId: string, actorId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      if (tenant.status !== 'SUSPENDED') {
        throw new BadRequestException(
          'Only suspended tenants can be reactivated',
        );
      }

      const updated = await this.prisma.client.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });

      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.TENANT_REACTIVATED,
        targetType: 'Tenant',
        targetId: tenantId,
        targetTenantId: tenantId,
      });

      await this.invalidateTenantCache(tenantId);

      return { message: 'Tenant reactivated', tenant: updated };
    });
  }

  // ─── Tenant Admins ──────────────────────────────────────────

  async getTenantAdmins(tenantId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const admins = await this.prisma.client.user.findMany({
        where: { tenantId, role: 'ADMIN' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return admins;
    });
  }

  async createTenantAdmin(
    tenantId: string,
    dto: CreateTenantAdminDto,
    actorId: string,
  ) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      // Check email uniqueness within this tenant
      const existingUser = await this.prisma.client.user.findFirst({
        where: { tenantId, email: dto.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use for this tenant');
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const admin = await this.prisma.client.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: 'ADMIN',
          emailVerified: true,
          status: 'ACTIVE',
        },
      });

      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.SUPERADMIN_ACTION,
        targetType: 'User',
        targetId: admin.id,
        targetTenantId: tenantId,
        details: { action: 'create_tenant_admin', email: dto.email },
      });

      await this.emailService.sendAccountCreatedByAdmin({
        to: dto.email,
        fullName: dto.fullName,
        tempPassword: dto.password,
      });

      return {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        status: admin.status,
        emailVerified: admin.emailVerified,
        createdAt: admin.createdAt,
      };
    });
  }

  // ─── Create User for Tenant ─────────────────────────────────

  async createUserForTenant(
    tenantId: string,
    dto: CreateUserDto,
    actorId: string,
  ) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const existingUser = await this.prisma.client.user.findFirst({
        where: { tenantId, email: dto.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use for this tenant');
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = await this.prisma.client.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
          phone: dto.phone ?? null,
          emailVerified: dto.emailVerified ?? false,
          status: 'ACTIVE',
        },
      });

      await this.audit.logPlatformAction({
        actorId,
        action: AuditAction.SUPERADMIN_ACTION,
        targetType: 'User',
        targetId: user.id,
        targetTenantId: tenantId,
        details: {
          action: 'create_user',
          tenantId,
          email: dto.email,
          role: dto.role,
        },
      });

      await this.emailService.sendAccountCreatedByAdmin({
        to: dto.email,
        fullName: dto.fullName,
        tempPassword: dto.password,
      });

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      };
    });
  }

  // ─── Analytics ──────────────────────────────────────────────

  async getTenantAnalytics(tenantId: string) {
    return this.prisma.bypassTenantScoping(async () => {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const [
        usersByRole,
        opportunitiesByStatus,
        requestsByStatus,
        holdingsCount,
      ] = await Promise.all([
        this.prisma.client.user.groupBy({
          by: ['role'],
          where: { tenantId },
          _count: true,
        }),
        this.prisma.client.opportunity.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        this.prisma.client.investmentRequest.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        this.prisma.client.holding.count({ where: { tenantId } }),
      ]);

      return {
        tenantId,
        tenantName: tenant.name,
        users: Object.fromEntries(
          usersByRole.map((r: any) => [r.role, r._count]),
        ),
        opportunities: Object.fromEntries(
          opportunitiesByStatus.map((r: any) => [r.status, r._count]),
        ),
        investmentRequests: Object.fromEntries(
          requestsByStatus.map((r: any) => [r.status, r._count]),
        ),
        holdings: holdingsCount,
      };
    });
  }

  // ─── Platform Jobs ────────────────────────────────────────

  async getPlatformJobStats() {
    return this.jobsService.getQueueStats();
  }

  // ─── Platform Health ───────────────────────────────────────

  async getPlatformHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkS3(),
    ]);

    const database =
      checks[0].status === 'fulfilled'
        ? checks[0].value
        : { healthy: false, responseMs: 0, error: 'Connection failed' };
    const redis =
      checks[1].status === 'fulfilled'
        ? checks[1].value
        : { healthy: false, responseMs: 0, error: 'Connection failed' };
    const s3 =
      checks[2].status === 'fulfilled'
        ? checks[2].value
        : { healthy: false, responseMs: 0, error: 'Connection failed' };

    const allHealthy = database.healthy && redis.healthy && s3.healthy;

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database, redis, s3 },
    };
  }

  private async checkDatabase(): Promise<{
    healthy: boolean;
    responseMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.prisma.client.$queryRawUnsafe('SELECT 1');
      return { healthy: true, responseMs: Date.now() - start };
    } catch (err: any) {
      return {
        healthy: false,
        responseMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  private async checkRedis(): Promise<{
    healthy: boolean;
    responseMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const result = await this.redis.getClient().ping();
      return {
        healthy: result === 'PONG',
        responseMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        healthy: false,
        responseMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  private async checkS3(): Promise<{
    healthy: boolean;
    responseMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      // Try to generate a signed URL for a non-existent key — validates credentials
      await this.s3.getSignedDownloadUrl('__health-check__', 60);
      return { healthy: true, responseMs: Date.now() - start };
    } catch (err: any) {
      return {
        healthy: false,
        responseMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  // ─── Platform Logs ────────────────────────────────────────

  async getPlatformLogs(query: QueryPlatformLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.action) where.action = query.action;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [data, total] = await this.prisma.bypassTenantScoping(async () => {
      return await Promise.all([
        this.prisma.client.auditLogEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            actor: { select: { email: true, fullName: true } },
            tenant: { select: { name: true, slug: true } },
          },
        }),
        this.prisma.client.auditLogEvent.count({ where }),
      ]);
    });

    return {
      data: data.map((r: any) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenant?.name ?? null,
        tenantSlug: r.tenant?.slug ?? null,
        actorId: r.actorId,
        actorEmail: r.actor?.email ?? null,
        actorName: r.actor?.fullName ?? null,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details: r.details,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async validateDomainAvailability(
    domain: string,
    excludeTenantId?: string,
  ): Promise<void> {
    const where: any = {
      OR: [{ domain }, { additionalDomains: { has: domain } }],
    };
    if (excludeTenantId) {
      where.id = { not: excludeTenantId };
    }

    const existing = await this.prisma.client.tenant.findFirst({ where });
    if (existing) {
      throw new ConflictException(
        `Domain "${domain}" is already in use by another tenant.`,
      );
    }
  }

  private getDefaultFeatures(tier: string): Record<string, boolean> {
    const starter: Record<string, boolean> = {
      market_overview: true,
      education_hub: true,
      audit_export: true,
      advanced_filters: true,
      issuer_portal: false,
      portfolio_distributions: false,
      portfolio_statements: false,
      mfa_support: false,
      advanced_analytics: false,
      custom_branding: false,
      api_access: false,
      white_label: false,
    };

    if (tier === 'STARTER') return starter;

    const professional: Record<string, boolean> = {
      ...starter,
      issuer_portal: true,
      portfolio_distributions: true,
      portfolio_statements: true,
      mfa_support: true,
    };

    if (tier === 'PROFESSIONAL') return professional;

    // ENTERPRISE — everything true
    return Object.fromEntries(Object.keys(professional).map((k) => [k, true]));
  }

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    try {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { domain: true, additionalDomains: true },
      });
      if (!tenant) return;

      await this.redis.del(
        `tenant:domain:${this.normalizeDomainCacheKey(tenant.domain)}`,
      );
      for (const domain of tenant.additionalDomains ?? []) {
        await this.redis.del(
          `tenant:domain:${this.normalizeDomainCacheKey(domain)}`,
        );
      }
    } catch {
      // Cache invalidation should never break the flow
    }
  }

  private normalizeDomainCacheKey(domain: string): string {
    let normalized = domain.trim().toLowerCase();
    if (normalized.startsWith('www.')) {
      normalized = normalized.slice(4);
    }
    return normalized;
  }
}
