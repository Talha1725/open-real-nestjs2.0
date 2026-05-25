import { beforeAll, describe, expect, it } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('QA Report - Admin user backend', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
  }, 70000);

  it('USR-08: admin creates user via POST /admin/users', async () => {
    const email = `qa-admin-user-${Date.now()}@openreal.test`;
    const created = await api('POST', '/admin/users', {
      token: adminToken,
      body: {
        email,
        fullName: 'QA Admin Created User',
        password: 'QaAdminUser123!',
        role: 'REGISTERED',
        emailVerified: true,
      },
    });

    expect(created.status).toBe(201);
    expect(created.data.id).toBeDefined();
    expect(created.data.email).toBe(email);
  });

  it('USR-07: admin cannot elevate user to SUPER_ADMIN', async () => {
    const email = `qa-elevate-user-${Date.now()}@openreal.test`;
    const created = await api('POST', '/admin/users', {
      token: adminToken,
      body: {
        email,
        fullName: 'QA Elevation User',
        password: 'QaElevateUser123!',
        role: 'REGISTERED',
        emailVerified: true,
      },
    });
    expect(created.status).toBe(201);

    const patch = await api('PATCH', `/admin/users/${created.data.id}`, {
      token: adminToken,
      body: { role: 'SUPER_ADMIN' },
    });
    expect(patch.status).toBe(403);
  });
});
