import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';
import { EncryptionService } from '../encryption/encryption.service.js';

interface CachedTenant {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain: string;
    status: string;
    featureTier: string;
  };
  config: {
    branding: any;
    legal: any;
    support: any;
    email: any;
    features: any;
    integrations: any;
    workflows: any;
  } | null;
}

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly isDev: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
    private readonly encryption: EncryptionService,
  ) {
    this.isDev = this.configService.get('NODE_ENV') === 'development';
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    const hostname = this.extractHostname(req);
    const cacheKey = `tenant:domain:${hostname}`;

    // 1. Check Redis cache
    let cached = await this.redis.getJSON<CachedTenant>(cacheKey);

    // 2. Cache miss → query DB
    if (!cached) {
      cached = await this.resolveFromDb(hostname);

      // 3. Dev fallback: ?tenant=<slug> when hostname is localhost
      if (!cached && this.isDev) {
        const slugParam = req.query.tenant as string | undefined;
        if (slugParam) {
          cached = await this.resolveBySlug(slugParam);
        }
      }
    }

    if (!cached) {
      throw new NotFoundException('Platform not found');
    }

    // 4. Check tenant status
    if (cached.tenant.status === 'SUSPENDED') {
      throw new ServiceUnavailableException('Platform temporarily unavailable');
    }
    if (cached.tenant.status === 'DEACTIVATED') {
      throw new NotFoundException('Platform not found');
    }

    // 5. Cache for next time
    await this.redis.setJSON(cacheKey, cached, CACHE_TTL);

    // 6. Attach tenantId to request for decorators
    (req as any).tenantId = cached.tenant.id;

    // 7. Wrap the rest of the request in tenant context
    //
    // P0-001 status: policies deployed, enforcement deferred.
    // We do not call prisma.setRlsContext() here because SET LOCAL only applies
    // reliably inside one transaction/connection, while normal request handlers
    // issue independent Prisma queries. Request-wide tenant isolation is handled
    // by PrismaService's client extension, which injects tenantId into every
    // tenant-scoped model. RLS remains defense-in-depth for explicit transaction
    // flows that set app.current_tenant_id before tenant-scoped queries.
    // Decrypt integrations if encrypted at rest
    const config = cached.config;
    if (config?.integrations && typeof config.integrations === 'string') {
      config.integrations = this.encryption.decryptJson(config.integrations);
    }

    const store = {
      tenantId: cached.tenant.id,
      tenant: {
        id: cached.tenant.id,
        name: cached.tenant.name,
        slug: cached.tenant.slug,
        domain: cached.tenant.domain,
        featureTier: cached.tenant.featureTier,
      },
      tenantConfig: config,
      featureFlags: config?.features ?? {},
      ipAddress: this.extractClientIp(req),
    };

    this.tenantContext.run(store, () => {
      next();
    });
  }

  private extractHostname(req: Request): string {
    let host = req.hostname || (req.headers.host ?? '').split(':')[0];
    host = host.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    return host;
  }

  private extractClientIp(req: Request): string | null {
    // With 'trust proxy' enabled in main.ts, req.ip will correctly contain 
    // the client's real IP even when behind Nginx or Cloudflare.
    const ip = req.ip || (req as any).ip || req.socket?.remoteAddress;
    return typeof ip === 'string' && ip.length > 0 ? ip : null;
  }

  private async resolveFromDb(hostname: string): Promise<CachedTenant | null> {
    // Tenant model is excluded from auto-scoping, no bypass needed
    const tenant = await this.prisma.client.tenant.findFirst({
      where: {
        OR: [{ domain: hostname }, { additionalDomains: { has: hostname } }],
      },
      include: { config: true },
    });

    if (!tenant) return null;
    return this.toCached(tenant);
  }

  private async resolveBySlug(slug: string): Promise<CachedTenant | null> {
    const tenant = await this.prisma.client.tenant.findFirst({
      where: { slug },
      include: { config: true },
    });

    if (!tenant) return null;
    return this.toCached(tenant);
  }

  private toCached(tenant: any): CachedTenant {
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        status: tenant.status,
        featureTier: tenant.featureTier,
      },
      config: tenant.config
        ? {
            branding: tenant.config.branding,
            legal: tenant.config.legal,
            support: tenant.config.support,
            email: tenant.config.email,
            features: tenant.config.features,
            integrations: tenant.config.integrations,
            workflows: tenant.config.workflows,
          }
        : null,
    };
  }
}
