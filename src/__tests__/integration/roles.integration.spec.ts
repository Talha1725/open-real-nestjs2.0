// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('Role Guard Integration', () => {
  it('REGISTERED user cannot access bank-details (requires VERIFIED)', async () => {
    // Register a new user — role defaults to REGISTERED
    const uniqueEmail = `test-role-${Date.now()}@register.test`;
    const adminToken = await loginAs('admin');
    const token = await createVerifiedUserAndLogin(
      adminToken,
      uniqueEmail,
      'Role Test User',
      'REGISTERED',
      'TestPass123!',
    );

    const { status } = await api('GET', '/users/me/bank-details', { token });
    expect(status).toBe(403);
  });

  it('VERIFIED user is not blocked by role guard on bank-details', async () => {
    const token = await loginAs('investor');
    const { status } = await api('GET', '/users/me/bank-details', { token });
    // Role guard should NOT return 403 for VERIFIED users
    expect(status).not.toBe(403);
  });

  it('non-SUPER_ADMIN cannot access super-admin routes', async () => {
    const token = await loginAs('investor');
    const { status } = await api('GET', '/super-admin/dashboard', { token });
    expect(status).toBe(403);
  });

  it('SUPER_ADMIN can access super-admin routes', async () => {
    const token = await loginAs('superadmin');
    const { status, data } = await api('GET', '/super-admin/dashboard', {
      token,
    });
    expect(status).toBe(200);
    expect(data.tenants).toBeDefined();
  });

  it('ISSUER cannot access super-admin routes', async () => {
    const token = await loginAs('issuer');
    const { status } = await api('GET', '/super-admin/dashboard', { token });
    expect(status).toBe(403);
  });
});
