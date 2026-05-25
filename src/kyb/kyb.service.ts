import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { S3Service } from '../documents/s3.service.js';
import { SubmitKybDto } from './dto/submit-kyb.dto.js';
import { QueryKybQueueDto } from './dto/query-kyb-queue.dto.js';
import { KybRejectDto } from './dto/kyb-reject.dto.js';

@Injectable()
export class KybService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly notifications: NotificationsService,
    private readonly s3: S3Service,
  ) {}

  // ─── Issuer Methods ──────────────────────────────────────────────────────────

  async submitKyb(dto: SubmitKybDto, userId: string) {
    const tenantId = this.tenantContext.getTenantId()!;

    // Check if user already has an org with pending/approved KYB
    const existingOrg = await this.prisma.client.issuerOrg.findFirst({
      where: { representativeUserId: userId },
      include: { kybApplications: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (existingOrg && existingOrg.kybApplications.length > 0) {
      const latestKyb = existingOrg.kybApplications[0];
      if (
        latestKyb.status === 'SUBMITTED' ||
        latestKyb.status === 'UNDER_REVIEW'
      ) {
        throw new ConflictException('KYB application already submitted');
      }
      if (latestKyb.status === 'APPROVED') {
        throw new ConflictException('KYB already approved');
      }
    }

    // Create IssuerOrg
    const issuerOrg = await this.prisma.client.issuerOrg.create({
      data: {
        tenantId,
        name: dto.organizationName,
        registrationNumber: dto.registrationNumber,
        countryOfIncorporation: dto.countryOfIncorporation,
        representativeUserId: userId,
        status: 'ACTIVE',
      },
    });

    // Create KYB Application
    const kybApplication = await this.prisma.client.kYBApplication.create({
      data: {
        tenantId,
        issuerOrgId: issuerOrg.id,
        status: 'SUBMITTED',
        documents: dto.documentKeys ?? [],
      },
    });

    await this.auditService.logTenantAction({
      actorId: userId,
      action: AuditAction.KYB_SUBMITTED,
      targetType: 'KYBApplication',
      targetId: kybApplication.id,
      details: {
        organizationName: dto.organizationName,
        registrationNumber: dto.registrationNumber,
      },
    });

    return {
      issuerOrg: {
        id: issuerOrg.id,
        name: issuerOrg.name,
        registrationNumber: issuerOrg.registrationNumber,
        countryOfIncorporation: issuerOrg.countryOfIncorporation,
      },
      kybApplication: {
        id: kybApplication.id,
        status: kybApplication.status,
        createdAt: kybApplication.createdAt,
      },
    };
  }

  async getKybStatus(userId: string) {
    const issuerOrg = await this.prisma.client.issuerOrg.findFirst({
      where: { representativeUserId: userId },
      include: { kybApplications: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!issuerOrg || issuerOrg.kybApplications.length === 0) {
      return { status: 'NOT_STARTED' };
    }

    const kyb = issuerOrg.kybApplications[0];

    return {
      organization: {
        name: issuerOrg.name,
        registrationNumber: issuerOrg.registrationNumber,
        countryOfIncorporation: issuerOrg.countryOfIncorporation,
      },
      kybStatus: kyb.status,
      rejectionReason: kyb.rejectionReason,
      submittedAt: kyb.createdAt,
      reviewedAt: kyb.reviewedAt,
    };
  }

  // ─── Admin Methods ───────────────────────────────────────────────────────────

  async listKybQueue(query: QueryKybQueueDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = 'SUBMITTED';
    }

    if (query.search) {
      where.issuerOrg = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          {
            representativeUser: {
              email: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.kYBApplication.findMany({
        where,
        include: {
          issuerOrg: {
            select: {
              name: true,
              registrationNumber: true,
              countryOfIncorporation: true,
              representativeUser: {
                select: { id: true, email: true, fullName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.kYBApplication.count({ where }),
    ]);

    return {
      data: data.map((k) => ({
        id: k.id,
        status: k.status,
        createdAt: k.createdAt,
        issuerOrg: {
          name: k.issuerOrg.name,
          registrationNumber: k.issuerOrg.registrationNumber,
          countryOfIncorporation: k.issuerOrg.countryOfIncorporation,
        },
        representative: k.issuerOrg.representativeUser,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getKybDetail(kybId: string) {
    const kyb = await this.prisma.client.kYBApplication.findUnique({
      where: { id: kybId },
      include: {
        issuerOrg: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            countryOfIncorporation: true,
            representativeUser: {
              select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!kyb) {
      throw new NotFoundException('KYB application not found');
    }

    // Generate signed URLs for document keys
    const documentKeys = Array.isArray(kyb.documents)
      ? (kyb.documents as string[])
      : [];
    const documents = await Promise.all(
      documentKeys.map(async (key) => {
        let url: string | null = null;
        try {
          url = await this.s3.getSignedDownloadUrl(key);
        } catch {
          url = null;
        }
        return { fileKey: key, url };
      }),
    );

    return {
      id: kyb.id,
      status: kyb.status,
      documents,
      rejectionReason: kyb.rejectionReason,
      reviewedBy: kyb.reviewedBy,
      reviewedAt: kyb.reviewedAt,
      createdAt: kyb.createdAt,
      updatedAt: kyb.updatedAt,
      issuerOrg: kyb.issuerOrg,
    };
  }

  async approveKyb(kybId: string, actorId: string) {
    const kyb = await this.prisma.client.kYBApplication.findUnique({
      where: { id: kybId },
      include: {
        issuerOrg: {
          select: {
            id: true,
            name: true,
            representativeUserId: true,
            representativeUser: {
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });

    if (!kyb) {
      throw new NotFoundException('KYB application not found');
    }

    if (kyb.status !== 'SUBMITTED' && kyb.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        `Cannot approve KYB with status "${kyb.status}"`,
      );
    }

    const updated = await this.prisma.client.kYBApplication.update({
      where: { id: kybId },
      data: {
        status: 'APPROVED',
        reviewedBy: actorId,
        reviewedAt: new Date(),
      },
    });

    // Upgrade user role to ISSUER
    await this.prisma.client.user.update({
      where: { id: kyb.issuerOrg.representativeUserId },
      data: { role: 'ISSUER' },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.KYB_APPROVED,
      targetType: 'KYBApplication',
      targetId: kybId,
      details: {
        issuerOrgId: kyb.issuerOrg.id,
        userId: kyb.issuerOrg.representativeUserId,
      },
    });

    await this.emailService.sendKybApproved({
      to: kyb.issuerOrg.representativeUser.email,
      fullName: kyb.issuerOrg.representativeUser.fullName,
      orgName: kyb.issuerOrg.name,
    });

    await this.notifications.create(
      kyb.tenantId,
      kyb.issuerOrg.representativeUserId,
      'SYSTEM',
      'KYB Approved',
      `Your KYB application for ${kyb.issuerOrg.name} has been approved.`,
    );

    return {
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt,
    };
  }

  async rejectKyb(kybId: string, dto: KybRejectDto, actorId: string) {
    const kyb = await this.prisma.client.kYBApplication.findUnique({
      where: { id: kybId },
      include: {
        issuerOrg: {
          select: {
            id: true,
            name: true,
            representativeUserId: true,
            representativeUser: {
              select: { email: true, fullName: true },
            },
          },
        },
      },
    });

    if (!kyb) {
      throw new NotFoundException('KYB application not found');
    }

    if (kyb.status !== 'SUBMITTED' && kyb.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        `Cannot reject KYB with status "${kyb.status}"`,
      );
    }

    const updated = await this.prisma.client.kYBApplication.update({
      where: { id: kybId },
      data: {
        status: 'REJECTED',
        reviewedBy: actorId,
        reviewedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.KYB_REJECTED,
      targetType: 'KYBApplication',
      targetId: kybId,
      details: {
        issuerOrgId: kyb.issuerOrg.id,
        userId: kyb.issuerOrg.representativeUserId,
        reason: dto.reason,
      },
    });

    await this.emailService.sendKybRejected({
      to: kyb.issuerOrg.representativeUser.email,
      fullName: kyb.issuerOrg.representativeUser.fullName,
      orgName: kyb.issuerOrg.name,
      reason: dto.reason,
    });

    return {
      id: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      reviewedAt: updated.reviewedAt,
    };
  }
}
