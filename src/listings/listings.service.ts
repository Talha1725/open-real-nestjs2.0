import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { S3Service } from '../documents/s3.service.js';
import { QueryListingsDto } from './dto/query-listings.dto.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';

const INVESTOR_VISIBLE_STATUSES = ['LIVE', 'CLOSED'];

const LISTING_CARD_SELECT = {
  id: true,
  title: true,
  summary: true,
  assetClass: true,
  region: true,
  currency: true,
  minimumAmount: true,
  heroImageKey: true,
  status: true,
  createdAt: true,
};

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async listListings(query: QueryListingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Cache key based on query filters
    const queryKey = JSON.stringify({
      status: query.status,
      assetClass: query.assetClass,
      region: query.region,
      search: query.search,
      page,
      limit,
    });
    const tenantId = this.tenantContext.getTenantId()!;
    const cacheKey = `${tenantId}:listings:list:${Buffer.from(queryKey).toString('base64')}`;

    const cached = await this.redis.getJSON<any>(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const where: any = {
      status: query.status
        ? { in: [query.status] }
        : { in: INVESTOR_VISIBLE_STATUSES },
    };

    if (query.assetClass) {
      where.assetClass = query.assetClass;
    }
    if (query.region) {
      where.region = query.region;
    }
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.opportunity.findMany({
        where,
        select: LISTING_CARD_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.opportunity.count({ where }),
    ]);

    const listings = await Promise.all(
      data.map(async (item) => ({
        ...item,
        heroImageUrl: await this.getHeroImageUrl(item.heroImageKey),
        heroImageKey: undefined,
      })),
    );

    const result = {
      data: listings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for 5 minutes
    await this.redis.setJSON(cacheKey, result, 300);

    return result;
  }

  async getHeroImageUrl(heroImageKey: string | null): Promise<string | null> {
    if (!heroImageKey) return null;
    try {
      return await this.s3.getSignedDownloadUrl(heroImageKey);
    } catch {
      return null;
    }
  }
}
