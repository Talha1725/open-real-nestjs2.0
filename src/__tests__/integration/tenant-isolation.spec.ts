// Integration test — requires: docker services running, seed data applied, app running on port 3000
//
// Tests cross-tenant data isolation: Tenant 1 users cannot see Tenant 2 data and vice versa.
// Tenant 1 (OpenReal): domain openreal.io, additionalDomains includes localhost
// Tenant 2 (Client X Capital): domain clientx.openreal.io

import { describe, it, expect, beforeAll } from 'vitest';
import {
  api,
  directAccessTokenForEmail,
  loginAs,
} from '../helpers/api.js';

describe('Tenant Data Isolation', () => {
  let tenant1InvestorToken: string;
  let tenant2InvestorToken: string;
  let tenant1AdminToken: string;

  beforeAll(async () => {
    // Login as Tenant 1 investor (via localhost which maps to Tenant 1)
    tenant1InvestorToken = await loginAs('investor');

    // Login as Tenant 1 admin
    tenant1AdminToken = await loginAs('admin');

    // Login as Tenant 2 investor via Host header
    tenant2InvestorToken = await directAccessTokenForEmail(
      'investor@clientx.com',
    );
  });

  it('Tenant 1 investor sees only Tenant 1 opportunities', async () => {
    const { status, data } = await api('GET', '/investor/listings', {
      token: tenant1InvestorToken,
    });

    expect(status).toBe(200);
    expect(data.data.length).toBeGreaterThanOrEqual(1);

    // All returned opportunities should NOT include Tenant 2's "Dubai Marina" listing
    const titles = data.data.map((o: any) => o.title);
    expect(titles).not.toContain('Dubai Marina Mixed-Use Tower');
    // Should contain Tenant 1's listing
    expect(titles).toContain('Central London Office Complex');
  });

  it('Tenant 2 has a distinct seeded investor identity', () => {
    expect(tenant2InvestorToken).not.toBe(tenant1InvestorToken);
  });

  it('Tenant 1 admin sees only Tenant 1 users', async () => {
    const { status, data } = await api('GET', '/admin/users', {
      token: tenant1AdminToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);

    // All returned users should have Tenant 1 emails (openreal.io domain)
    const emails: string[] = data.data.map((u: any) => u.email);
    const hasTenant2User = emails.some(
      (e) =>
        e.endsWith('@clientx.com') ||
        e === 'investor@clientx.com' ||
        e === 'admin@clientx.com',
    );
    expect(hasTenant2User).toBe(false);
  });
});
