import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { S3Service } from '../documents/s3.service.js';

const LOGO_FIELDS = ['logoPrimary', 'logoMonochrome', 'logoFavicon'] as const;

/**
 * Normalise branding JSON from any legacy format (nested colors/typography/logo)
 * into the canonical flat structure the frontend expects.
 */
export function flattenBranding(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'colors' && typeof value === 'object' && value !== null) {
      Object.assign(out, value);
    } else if (
      key === 'typography' &&
      typeof value === 'object' &&
      value !== null
    ) {
      Object.assign(out, value);
    } else if (key === 'logo' && typeof value === 'object' && value !== null) {
      const logo = value as Record<string, string>;
      if (logo.primary !== undefined) out.logoPrimary = logo.primary;
      if (logo.monochrome !== undefined) out.logoMonochrome = logo.monochrome;
      if (logo.favicon !== undefined) out.logoFavicon = logo.favicon;
    } else if (key === 'overrides') {
      // strip overrides — not part of the public response
    } else {
      out[key] = value;
    }
  }

  return out;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly s3Service: S3Service,
  ) {}

  async getBranding() {
    const tenant = this.tenantContext.getTenant();
    const config = this.tenantContext.getTenantConfig();

    const rawBranding =
      typeof config?.branding === 'object' && config.branding !== null
        ? (config.branding as Record<string, any>)
        : {};

    const flat = flattenBranding(rawBranding);

    // Build clean output: resolve logo keys to URLs, strip raw keys
    const branding: Record<string, any> = {};
    for (const [key, value] of Object.entries(flat)) {
      if (LOGO_FIELDS.includes(key as (typeof LOGO_FIELDS)[number])) {
        // Don't copy raw S3 keys to output — only resolved URLs
        continue;
      }
      branding[key] = value;
    }

    // Resolve logo URLs
    for (const key of LOGO_FIELDS) {
      const raw = flat[key];
      branding[`${key}Url`] = await this.resolveLogoUrl(raw ?? '');
    }

    return {
      tenant: {
        name: tenant?.name ?? '',
        slug: tenant?.slug ?? '',
        domain: tenant?.domain ?? '',
      },
      branding,
      legal: config?.legal ?? {},
      support: config?.support ?? {},
    };
  }

  getFeatures(): object {
    const featureFlags = this.tenantContext.getFeatureFlags();

    return {
      features: featureFlags ?? {},
    };
  }

  /**
   * Resolve a logo value to a usable URL:
   * - S3 key (contains '/', not http/local path) → signed URL
   * - Local path (starts with '/') → pass through
   * - Empty / null → null
   */
  private async resolveLogoUrl(value: string): Promise<string | null> {
    if (!value) return null;
    if (value.startsWith('http')) return value;
    if (value.startsWith('/')) return value;
    if (value.includes('/')) {
      // Looks like an S3 key
      try {
        return await this.s3Service.getSignedDownloadUrl(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
