import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, EXACT_ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

// Numeric level for hierarchy checks.
// ISSUER and VERIFIED share level 2 but are distinct roles.
// ADMIN (3) and SUPER_ADMIN (4) can access any lower-level route.
const ROLE_LEVEL: Record<string, number> = {
  REGISTERED: 1,
  VERIFIED: 2,
  ISSUER: 2,
  SPV_MANAGER: 2,
  SETTLEMENT_OPS: 2,
  MARKET_OPS: 2,
  COMPLIANCE_OFFICER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Exact-role check: no hierarchy, user.role must be in the list
    const exactRoles = this.reflector.getAllAndOverride<string[]>(
      EXACT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (exactRoles && exactRoles.length > 0) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      if (!user || !user.role || !exactRoles.includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const userLevel = ROLE_LEVEL[user.role] ?? 0;

    const hasRole = requiredRoles.some((required) => {
      const requiredLevel = ROLE_LEVEL[required] ?? 0;

      // 1. Exact match always passes
      if (user.role === required) return true;

      // 2. Functional roles (Level 2) are STRICT — they require exact match (handled above)
      // or explicit permission. Hierarchy does NOT apply to these business roles.
      if (requiredLevel === 2) {
        return false;
      }

      // 3. REGISTERED: any authenticated user with level >= 1 passes
      if (required === 'REGISTERED') {
        return userLevel >= 1;
      }

      // 4. ADMIN / SUPER_ADMIN routes: Allow hierarchical pass-through for levels 3+
      if (userLevel >= 3 && userLevel >= requiredLevel) {
        return true;
      }

      return false;
    });

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
