import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { QueryArticlesDto } from './dto/query-articles.dto.js';

const ARTICLE_SELECT = {
  id: true,
  slug: true,
  title: true,
  body: true,
  category: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
};

const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  getLegalPage(slug: string) {
    const config = this.tenantContext.getTenantConfig();
    const legal = config?.legal ?? {};

    const LEGAL_MAP: Record<string, string> = {
      terms: 'termsUrl',
      privacy: 'privacyUrl',
      notices: 'regulatoryNotice',
    };

    const field = LEGAL_MAP[slug];
    if (!field || !(field in legal)) {
      throw new NotFoundException(`Legal page "${slug}" not found`);
    }

    return {
      slug,
      content: legal[field] ?? '',
      companyAddress: legal.companyAddress ?? '',
      copyrightHolder: legal.copyrightHolder ?? '',
    };
  }

  // ─── Admin endpoints ─────────────────────────────────────────────────────────

  async listArticles(query: QueryArticlesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category) {
      where.category = query.category;
    }
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.contentArticle.findMany({
        where,
        select: ARTICLE_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.contentArticle.count({ where }),
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

  async createArticle(dto: CreateArticleDto, actorId: string) {
    const tenantId = this.tenantContext.getTenantId()!;

    const existing = await this.prisma.client.contentArticle.findFirst({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('An article with this slug already exists');
    }

    const article = await this.prisma.client.contentArticle.create({
      data: {
        tenantId,
        slug: dto.slug,
        title: dto.title,
        body: dto.body,
        category: dto.category,
        published: dto.published ?? false,
        publishedAt: dto.published ? new Date() : null,
      },
      select: ARTICLE_SELECT,
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.CONTENT_CREATED,
      targetType: 'ContentArticle',
      targetId: article.id,
      details: { slug: dto.slug, category: dto.category },
    });

    return article;
  }

  async updateArticle(
    articleId: string,
    dto: UpdateArticleDto,
    actorId: string,
  ) {
    const article = await this.prisma.client.contentArticle.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    if (dto.slug && dto.slug !== article.slug) {
      const existing = await this.prisma.client.contentArticle.findFirst({
        where: { slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('An article with this slug already exists');
      }
    }

    const data: any = {};
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category;

    if (dto.published !== undefined) {
      data.published = dto.published;
      if (dto.published && !article.published) {
        data.publishedAt = new Date();
      }
      if (!dto.published) {
        data.publishedAt = null;
      }
    }

    const updated = await this.prisma.client.contentArticle.update({
      where: { id: articleId },
      data,
      select: ARTICLE_SELECT,
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.CONTENT_UPDATED,
      targetType: 'ContentArticle',
      targetId: articleId,
      details: {
        changes: Object.keys(dto).filter((k) => (dto as any)[k] !== undefined),
      },
    });

    return updated;
  }

  async deleteArticle(articleId: string, actorId: string) {
    const article = await this.prisma.client.contentArticle.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    await this.prisma.client.contentArticle.delete({
      where: { id: articleId },
    });

    await this.auditService.logTenantAction({
      actorId,
      action: AuditAction.CONTENT_DELETED,
      targetType: 'ContentArticle',
      targetId: articleId,
      details: { slug: article.slug, title: article.title },
    });

    return { message: 'Article deleted' };
  }
}
