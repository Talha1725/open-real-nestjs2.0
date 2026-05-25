import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
export class PublicNewsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished(category?: string) {
    const where: any = { published: true };
    if (category) where.category = category;

    return this.prisma.client.contentArticle.findMany({
      where,
      select: ARTICLE_LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getPublishedBySlug(slug: string) {
    const article = await this.prisma.client.contentArticle.findFirst({
      where: { slug, published: true },
      select: ARTICLE_SELECT,
    });

    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async getPublicNewsFeed(limit = 20, category?: 'NEWS' | 'EDUCATION' | 'FAQ') {
    const articles = await this.prisma.client.contentArticle.findMany({
      where: {
        published: true,
        ...(category ? { category } : {}),
      },
      select: {
        slug: true,
        title: true,
        body: true,
        category: true,
        publishedAt: true,
        createdAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return articles.map((article) => {
      const bodyText = this.stripHtml(article.body);
      return {
        slug: article.slug,
        title: article.title,
        summary: this.buildSummary(bodyText),
        category: article.category,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        createdAt: article.createdAt.toISOString(),
        timestamp: (article.publishedAt ?? article.createdAt).toISOString(),
        path: `/public/education/${article.slug}`,
      };
    });
  }

  private buildSummary(body: string, maxLength = 180) {
    const cleaned = body.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
  }

  private stripHtml(body: string) {
    return body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
