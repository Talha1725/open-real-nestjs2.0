import { describe, it, expect, beforeAll } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('QA Report - KYC admin backend', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    await api('PATCH', '/admin/settings/integrations', {
      token: adminToken,
      body: {
        kycProvider: 'manual-review',
        overrides: { kycConfig: null },
      },
    });
  }, 70000);

  it('KYC-07: approve upgrades role to VERIFIED and writes audit', async () => {
    const email = `qa-kyc-approve-${Date.now()}@openreal.test`;
    const token = await createVerifiedUserAndLogin(
      adminToken,
      email,
      'QA KYC Approve User',
    );

    const initiated = await api('POST', '/users/me/verification/initiate', {
      token,
    });
    expect([200, 201]).toContain(initiated.status);

    const queue = await api(
      'GET',
      `/admin/kyc?status=PENDING_REVIEW&search=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    const verificationId = queue.data?.data?.[0]?.id;
    const userId = queue.data?.data?.[0]?.user?.id;
    expect(verificationId).toBeDefined();
    expect(userId).toBeDefined();

    const approved = await api('POST', `/admin/kyc/${verificationId}/approve`, {
      token: adminToken,
    });
    expect(approved.status).toBe(201);

    const userDetail = await api('GET', `/admin/users/${userId}`, {
      token: adminToken,
    });
    expect(userDetail.status).toBe(200);
    expect(userDetail.data?.role).toBe('VERIFIED');

    const audit = await api(
      'GET',
      '/admin/audit-logs?action=KYC_APPROVED&limit=50',
      {
        token: adminToken,
      },
    );
    expect(audit.status).toBe(200);
    const event = (audit.data?.data ?? []).find(
      (e: any) => e.targetId === verificationId,
    );
    expect(event).toBeDefined();
  }, 70000);

  it('KYC-10: reject stores rejection reason', async () => {
    const email = `qa-kyc-reject-${Date.now()}@openreal.test`;
    const token = await createVerifiedUserAndLogin(
      adminToken,
      email,
      'QA KYC Reject User',
    );

    const initiated = await api('POST', '/users/me/verification/initiate', {
      token,
    });
    expect([200, 201]).toContain(initiated.status);

    const queue = await api(
      'GET',
      `/admin/kyc?status=PENDING_REVIEW&search=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    const verificationId = queue.data?.data?.[0]?.id;
    expect(verificationId).toBeDefined();

    const reason = 'Document mismatch with submitted identity';
    const rejected = await api('POST', `/admin/kyc/${verificationId}/reject`, {
      token: adminToken,
      body: { reason },
    });
    expect(rejected.status).toBe(201);

    const detail = await api('GET', `/admin/kyc/${verificationId}`, {
      token: adminToken,
    });
    expect(detail.status).toBe(200);
    expect(detail.data?.rejectionReason).toBe(reason);
  }, 70000);
});
