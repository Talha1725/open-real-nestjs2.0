import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    type: 'TRANSFER_UPDATE' | 'SYSTEM' | 'COMPLIANCE',
    title: string,
    body: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.client.notification.create({
      data: {
        tenantId,
        userId,
        type,
        title,
        body,
        metadata: metadata as any,
      },
    });
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const tenantId = this.tenantContext.getTenantId()!;

    const [data, total] = await Promise.all([
      this.prisma.client.notification.findMany({
        where: { userId, tenantId },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }], // Unread first
        skip,
        take: limit,
      }),
      this.prisma.client.notification.count({ where: { userId, tenantId } }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const tenantId = this.tenantContext.getTenantId()!;
    const count = await this.prisma.client.notification.count({
      where: { userId, tenantId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const tenantId = this.tenantContext.getTenantId()!;
    const notif = await this.prisma.client.notification.findFirst({
      where: { id: notificationId, userId, tenantId },
      select: { id: true },
    });

    if (!notif) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.client.notification.updateMany({
      where: { id: notificationId, userId, tenantId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const tenantId = this.tenantContext.getTenantId()!;
    const result = await this.prisma.client.notification.updateMany({
      where: { userId, tenantId, isRead: false },
      data: { isRead: true },
    });
    return { count: result.count };
  }
}
