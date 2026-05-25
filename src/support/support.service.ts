import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { QueryTicketsDto } from './dto/query-tickets.dto.js';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createTicket(dto: CreateTicketDto, userId: string) {
    const tenantId = this.tenantContext.getTenantId()!;

    const ticket = await this.prisma.client.supportTicket.create({
      data: {
        tenantId,
        userId,
        subject: dto.subject,
        message: dto.message,
        status: 'OPEN',
      },
    });

    return {
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt,
    };
  }

  async listMyTickets(userId: string, query: QueryTicketsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.supportTicket.findMany({
        where,
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.supportTicket.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.client.supportTicket.findFirst({
      where: { id: ticketId, userId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return {
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  async getFaq() {
    const articles = await this.prisma.client.contentArticle.findMany({
      where: { category: 'FAQ', published: true },
      select: {
        id: true,
        slug: true,
        title: true,
        body: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return articles;
  }
}
