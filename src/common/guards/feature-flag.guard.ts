import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredFeature) {
      return true;
    }

    const flags = this.tenantContext.getFeatureFlags() ?? {};
    if (!flags[requiredFeature]) {
      throw new ForbiddenException('Feature not available');
    }
    return true;
  }
}
