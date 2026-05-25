import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to build tenant-aware tracker keys.
 *
 * Key format:
 *  - Authenticated: {tenantId}:{userId}
 *  - Unauthenticated: {tenantId}:{ip}
 *
 * Health and docs endpoints are excluded from throttling.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const url: string = req.url ?? '';

    if (
      url === '/health' ||
      url.startsWith('/api/docs') ||
      url.startsWith('/api/v1/health')
    ) {
      return true;
    }

    return false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const tenantId: string = req.tenantId ?? 'no-tenant';
    const user = req.user as { sub?: string } | undefined;

    if (user?.sub) {
      return `${tenantId}:${user.sub}`;
    }

    const ip: string = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = req.body?.email ? `:${req.body.email}` : '';
    return `${tenantId}:${ip}${email}`;
  }
}
