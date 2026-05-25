import { describe, it, expect, beforeAll } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('QA Report - KYB admin backend', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
  }, 70000);

  it('KYB-05: KYB approval creates notification for issuer user', async () => {
    const email = `qa-kyb-${Date.now()}@openreal.test`;
    const token = await createVerifiedUserAndLogin(
      adminToken,
      email,
      'QA KYB User',
    );

    const submitted = await api('POST', '/issuer/kyb', {
      token,
      body: {
        organizationName: `QA Org ${Date.now()}`,
        registrationNumber: `REG-${Date.now()}`,
        countryOfIncorporation: 'United Kingdom',
        representativeName: 'QA KYB User',
        representativeEmail: email,
        documentKeys: [],
      },
    });
    expect(submitted.status).toBe(201);

    const queue = await api(
      'GET',
      `/admin/kyb?status=SUBMITTED&search=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    expect(queue.status).toBe(200);
    const kybId = queue.data?.data?.[0]?.id;
    expect(kybId).toBeDefined();

    const approved = await api('POST', `/admin/kyb/${kybId}/approve`, {
      token: adminToken,
    });
    expect(approved.status).toBe(201);

    const notifications = await api('GET', '/notifications?limit=20', {
      token,
    });
    expect(notifications.status).toBe(200);
    const systemNotification = (notifications.data.data as any[]).find(
      (n) => n.type === 'SYSTEM',
    );
    expect(systemNotification).toBeDefined();
  });
});
