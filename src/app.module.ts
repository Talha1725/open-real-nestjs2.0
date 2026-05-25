import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

import { TenantContextModule } from './common/tenant-context/tenant-context.module.js';
import { EncryptionModule } from './common/encryption/encryption.module.js';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { JwtAuthGuard } from './common/guards/auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { FeatureFlagGuard } from './common/guards/feature-flag.guard.js';
import { TenantThrottlerGuard } from './common/guards/throttler.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RedisService } from './redis/redis.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { AuditModule } from './audit/audit.module.js';
import { KycModule } from './kyc/kyc.module.js';
import { KybModule } from './kyb/kyb.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { OpportunitiesModule } from './opportunities/opportunities.module.js';
import { InvestmentRequestsModule } from './investment-requests/investment-requests.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { IssuerModule } from './issuer/issuer.module.js';
import { TenantAdminModule } from './tenant-admin/tenant-admin.module.js';
import { SuperAdminModule } from './super-admin/super-admin.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ContentModule } from './content/content.module.js';
import { SupportModule } from './support/support.module.js';
import { InvestorHomeModule } from './investor-home/investor-home.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MarketDataModule } from './market-data/market-data.module.js';
import { TransferModule } from './transfer/transfer.module.js';
import { MarketModule } from './market/market.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TenantContextModule,
    EncryptionModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      useFactory: (redis: RedisService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis.getClient()),
      }),
      inject: [RedisService],
    }),
    AuthModule,
    UsersModule,
    TenantsModule,
    AuditModule,
    KycModule,
    KybModule,
    ListingsModule,
    OpportunitiesModule,
    InvestmentRequestsModule,
    PortfolioModule,
    IssuerModule,
    TenantAdminModule,
    SuperAdminModule,
    DocumentsModule,
    NotificationsModule,
    ContentModule,
    SupportModule,
    InvestorHomeModule,
    JobsModule,
    MarketDataModule,
    TransferModule,
    MarketModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: Tenant → Auth → Throttler → Roles → Feature.
    // Throttler runs after auth so authenticated traffic is keyed by user,
    // not just tenant/IP. Public auth routes still throttle by tenant/IP.
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/*path', method: RequestMethod.ALL },
        { path: 'webhooks/kyc/:tenantSlug', method: RequestMethod.POST },
        { path: 'api/docs', method: RequestMethod.ALL },
        { path: 'api/docs-json', method: RequestMethod.ALL },
        { path: 'api/docs-yaml', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
