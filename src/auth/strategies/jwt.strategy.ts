import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service.js';
import { AuthService } from '../auth.service.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly authService: AuthService,
  ) {
    const cookieExtractor = (req: any): string | null => {
      const header: string | undefined = req?.headers?.cookie;
      if (!header) return null;
      // Minimal cookie parsing (avoid extra deps)
      const parts = header.split(';').map((p) => p.trim());
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const k = part.slice(0, eq);
        if (k === 'or_access') {
          return decodeURIComponent(part.slice(eq + 1));
        }
      }
      return null;
    };
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const currentTenantId = this.tenantContext.getTenantId();

    if (
      currentTenantId &&
      payload.tenantId &&
      payload.tenantId !== currentTenantId
    ) {
      throw new UnauthorizedException('Token does not belong to this platform');
    }

    // Check if the token has been revoked (logout / rotation)
    if (
      payload.jti &&
      (await this.authService.isTokenBlacklisted(payload.jti))
    ) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      jti: payload.jti,
    };
  }
}
