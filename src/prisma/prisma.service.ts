import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';

// Models where tenantId is automatically injected into every query.
// Tenant and AuditLogEvent are excluded:
//   - Tenant: is the root entity, not scoped to itself
//   - AuditLogEvent: tenantId is nullable (platform-level events) and
//     super admins need cross-tenant access
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'TenantConfig',
  'Verification',
  'IssuerOrg',
  'KYBApplication',
  'Opportunity',
  'OpportunityDocument',
  'InvestmentRequest',
  'PaymentInstruction',
  'Holding',
  'Notification',
  'Distribution',
  'Statement',
  'ContentArticle',
  'SupportTicket',
  'BankDetails',
  'TransferCase',
  'TransferInvitation',
  'TransferChecklistItem',
  'PriorityNotice',
  'RegistryEntry',
  'TokenRecord',
  'Order',
  'Trade',
  'SettlementRecord',
  'LiquidityConfig',
]);

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_MODIFY_OPS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * Tenant-scoped Prisma service.
 *
 * Uses Prisma `$extends` to automatically inject `tenantId` into every query
 * for tenant-scoped models based on the current request's AsyncLocalStorage
 * context set by TenantContextService.
 *
 * Usage in other services:
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   // Inside a request with tenant context — auto-scoped:
 *   this.prisma.client.user.findMany()
 *   // → SELECT ... FROM users WHERE tenant_id = '<current tenant>'
 *
 *   // No tenant context (seeding, super admin) — unscoped:
 *   this.prisma.client.user.findMany()
 *   // → SELECT ... FROM users
 *
 *   // Explicit bypass:
 *   this.prisma.bypassTenantScoping(() => this.prisma.client.user.findMany())
 *   // → SELECT ... FROM users  (ignores active tenant context)
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: pg.Pool;
  private readonly baseClient: PrismaClient;
  private readonly _client: any;
  private readonly bypassAls = new AsyncLocalStorage<boolean>();

  constructor(private readonly tenantContext: TenantContextService) {
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const adapter = new PrismaPg(this.pool);
    this.baseClient = new PrismaClient({ adapter });

    this._client = this.baseClient.$extends({
      query: {
        $allOperations: ({ model, operation, args, query }: any) => {
          // Bypass mode — skip all scoping
          if (this.bypassAls.getStore()) {
            return query(args);
          }

          const tenantId = this.tenantContext.getTenantId();

          // No tenant context or model not scoped — pass through
          if (!tenantId || !model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          // --- READ + UPDATE/DELETE: inject where.tenantId ---
          if (READ_OPS.has(operation) || WRITE_MODIFY_OPS.has(operation)) {
            args.where = args.where ?? {};
            if (!args.where.tenantId) {
              args.where.tenantId = tenantId;
            }
            return query(args);
          }

          // --- CREATE: inject data.tenantId ---
          if (operation === 'create') {
            args.data = args.data ?? {};
            if (!args.data.tenantId) {
              args.data.tenantId = tenantId;
            }
            return query(args);
          }

          // --- CREATE MANY: inject tenantId on each item ---
          if (operation === 'createMany') {
            const items = Array.isArray(args.data) ? args.data : [args.data];
            for (const item of items) {
              if (!item.tenantId) {
                item.tenantId = tenantId;
              }
            }
            return query(args);
          }

          // --- UPSERT: inject where.tenantId + create.tenantId ---
          if (operation === 'upsert') {
            args.where = args.where ?? {};
            if (!args.where.tenantId) {
              args.where.tenantId = tenantId;
            }
            args.create = args.create ?? {};
            if (!args.create.tenantId) {
              args.create.tenantId = tenantId;
            }
            return query(args);
          }

          return query(args);
        },
      },
    });
  }

  /** The tenant-scoped Prisma client. Use this for all database access. */
  get client() {
    return this._client;
  }

  /**
   * Run a callback without automatic tenant scoping.
   * Useful for super admin cross-tenant operations or seed scripts.
   */
  bypassTenantScoping<T>(callback: () => Promise<T>): Promise<T> {
    return this.bypassAls.run(true, callback);
  }

  /**
   * Set the PostgreSQL session variable for RLS defense-in-depth.
   * Call within a transaction or at the start of a request.
   */
  async setRlsContext(tenantId: string): Promise<void> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tenantId,
      )
    ) {
      throw new Error('Invalid tenant ID format');
    }
    await this.baseClient.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  }

  async onModuleInit() {
    await this.baseClient.$connect();
  }

  async onModuleDestroy() {
    await this.baseClient.$disconnect();
    await this.pool.end();
  }
}
