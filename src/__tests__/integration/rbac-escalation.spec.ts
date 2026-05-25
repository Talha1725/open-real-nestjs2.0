// Integration test — requires: docker services running, seed data applied, app running on port 3000
//
// Tests that each role is properly restricted and cannot escalate privileges.

import { describe, it, expect, beforeAll } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('RBAC Escalation Prevention', () => {
  let registeredToken: string;
  let investorToken: string;
  let issuerToken: string;
  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin'); // ADMIN

    // Create an email-verified REGISTERED user so login can issue cookies.
    const uniqueEmail = `rbac-test-${Date.now()}@register.test`;
    registeredToken = await createVerifiedUserAndLogin(
      adminToken,
      uniqueEmail,
      'RBAC Test User',
      'REGISTERED',
      'TestPass123!',
    );

    // Existing seed users
    investorToken = await loginAs('investor'); // VERIFIED
    issuerToken = await loginAs('issuer'); // ISSUER
    superAdminToken = await loginAs('superadmin'); // SUPER_ADMIN
  });

  it('REGISTERED user cannot access GET /investor/listings (requires VERIFIED)', async () => {
    const { status } = await api('GET', '/investor/listings', {
      token: registeredToken,
    });
    expect(status).toBe(403);
  });

  it('VERIFIED user cannot access GET /admin/dashboard (requires ADMIN)', async () => {
    const { status } = await api('GET', '/admin/dashboard', {
      token: investorToken,
    });
    expect(status).toBe(403);
  });

  it('VERIFIED user cannot access GET /super-admin/tenants (requires SUPER_ADMIN)', async () => {
    const { status } = await api('GET', '/super-admin/tenants', {
      token: investorToken,
    });
    expect(status).toBe(403);
  });

  it('ISSUER cannot access GET /admin/dashboard (requires ADMIN)', async () => {
    const { status } = await api('GET', '/admin/dashboard', {
      token: issuerToken,
    });
    expect(status).toBe(403);
  });

  it('ADMIN cannot access GET /super-admin/tenants (requires SUPER_ADMIN)', async () => {
    const { status } = await api('GET', '/super-admin/tenants', {
      token: adminToken,
    });
    expect(status).toBe(403);
  });

  it('ADMIN cannot access GET /investor/listings (requires VERIFIED exact business role)', async () => {
    const { status } = await api('GET', '/investor/listings', {
      token: adminToken,
    });
    expect(status).toBe(403);
  });

  it('SUPER_ADMIN cannot access GET /investor/listings (requires VERIFIED exact business role)', async () => {
    const { status } = await api('GET', '/investor/listings', {
      token: superAdminToken,
    });
    expect(status).toBe(403);
  });

  it('REGISTERED user cannot POST /investor/investment-requests (requires VERIFIED)', async () => {
    const { status } = await api('POST', '/investor/investment-requests', {
      token: registeredToken,
      body: {
        opportunityId: '00000000-0000-0000-0000-000000000000',
        amount: 10000,
        acknowledgements: ['ack1'],
      },
    });
    expect(status).toBe(403);
  });

  it('ISSUER cannot access GET /investor/listings (requires VERIFIED)', async () => {
    const { status } = await api('GET', '/investor/listings', {
      token: issuerToken,
    });
    expect(status).toBe(403);
  });
});
