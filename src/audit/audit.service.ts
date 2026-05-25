import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditAction } from './audit-action.enum.js';
import { AuditLogEntry } from './interfaces/audit-log-entry.interface.js';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const tenantId =
        entry.tenantId !== undefined
          ? entry.tenantId
          : (this.tenantContext.getTenantId() ?? null);

      const ipAddress =
        entry.ipAddress ?? this.tenantContext.getIpAddress?.() ?? null;

      await this.prisma.client.auditLogEvent.create({
        data: {
          tenantId,
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          details: entry.details ?? undefined,
          ipAddress,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write audit log', error);
      throw error;
    }
  }

  async logTenantAction(params: {
    actorId: string;
    action: AuditAction;
    targetType: string;
    targetId: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    await this.log({
      tenantId: this.tenantContext.getTenantId() ?? null,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
      ipAddress: params.ipAddress,
    });
  }

  async logPlatformAction(params: {
    actorId: string;
    action: AuditAction;
    targetType: string;
    targetId: string;
    targetTenantId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    await this.log({
      tenantId: params.targetTenantId ?? null,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
      ipAddress: params.ipAddress,
    });
  }

  async query(
    tenantId: string | null,
    params: QueryAuditLogsDto,
  ): Promise<{
    data: any[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    const andConditions: any[] = [];

    if (tenantId) {
      where.tenantId = tenantId;
    }
    if (params.action) {
      where.action = params.action;
    }
    if (params.actorId) {
      where.actorId = params.actorId;
    }
    if (params.targetType) {
      where.targetType = params.targetType;
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }
    if (params.search) {
      andConditions.push({
        OR: [
          { action: { contains: params.search, mode: 'insensitive' } },
          { targetType: { contains: params.search, mode: 'insensitive' } },
          { actorId: { contains: params.search, mode: 'insensitive' } },
          { targetId: { contains: params.search, mode: 'insensitive' } },
        ],
      });
    }

    const outcomeCategory = params.category ?? params.outcome;
    const outcomeFilter = this.buildOutcomeFilter(outcomeCategory);
    if (outcomeFilter) {
      andConditions.push(outcomeFilter);
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.auditLogEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.auditLogEvent.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async export(
    tenantId: string | null,
    params: QueryAuditLogsDto,
    actorId: string,
  ): Promise<any[]> {
    // Log the export action itself
    await this.log({
      tenantId,
      actorId,
      action: AuditAction.DATA_EXPORT,
      targetType: 'AuditLogEvent',
      targetId: 'bulk-export',
      details: { filters: params },
    });

    const where: any = {};
    const andConditions: any[] = [];

    if (tenantId) {
      where.tenantId = tenantId;
    }
    if (params.action) {
      where.action = params.action;
    }
    if (params.actorId) {
      where.actorId = params.actorId;
    }
    if (params.targetType) {
      where.targetType = params.targetType;
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }
    if (params.search) {
      andConditions.push({
        OR: [
          { action: { contains: params.search, mode: 'insensitive' } },
          { targetType: { contains: params.search, mode: 'insensitive' } },
          { actorId: { contains: params.search, mode: 'insensitive' } },
          { targetId: { contains: params.search, mode: 'insensitive' } },
        ],
      });
    }

    const outcomeCategory = params.category ?? params.outcome;
    const outcomeFilter = this.buildOutcomeFilter(outcomeCategory);
    if (outcomeFilter) {
      andConditions.push(outcomeFilter);
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    return this.prisma.client.auditLogEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildOutcomeFilter(category?: string): any | null {
    if (!category) return null;

    const errorPatterns = [
      { action: { contains: 'REJECT', mode: 'insensitive' } },
      { action: { contains: 'FAILED', mode: 'insensitive' } },
      { action: { contains: 'SUSPENDED', mode: 'insensitive' } },
      { action: { contains: 'DEACTIVATED', mode: 'insensitive' } },
      { action: { contains: 'CANCELLED', mode: 'insensitive' } },
    ];

    const warningPatterns = [
      { action: { contains: 'ESCALATED', mode: 'insensitive' } },
      { action: { contains: 'REVIEW', mode: 'insensitive' } },
    ];

    const successPatterns = [
      { action: { contains: 'APPROVED', mode: 'insensitive' } },
      { action: { contains: 'CONFIRMED', mode: 'insensitive' } },
      { action: { contains: 'CREATED', mode: 'insensitive' } },
      { action: { contains: 'SUBMITTED', mode: 'insensitive' } },
      { action: { contains: 'UPDATED', mode: 'insensitive' } },
      { action: { contains: 'FINALIZED', mode: 'insensitive' } },
      { action: { contains: 'REACTIVATED', mode: 'insensitive' } },
    ];

    if (category === 'error') {
      return { OR: errorPatterns };
    }

    if (category === 'warning') {
      return { OR: warningPatterns };
    }

    if (category === 'success') {
      return { OR: successPatterns };
    }

    if (category === 'info') {
      // Info is a catch-all for actions that do not match success/error/warning buckets.
      return {
        NOT: {
          OR: [...errorPatterns, ...warningPatterns, ...successPatterns],
        },
      };
    }

    return null;
  }
}
