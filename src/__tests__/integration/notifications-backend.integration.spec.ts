import { beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('QA Report - Notifications backend', () => {
  let adminToken: string;
  let investorToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    investorToken = await loginAs('investor');
  }, 70000);

  it('NB-02: GET /notifications without token returns 401', async () => {
    const res = await api('GET', '/notifications');
    expect(res.status).toBe(401);
  });

  it('NB-03: GET /notifications supports pagination', async () => {
    const res = await api('GET', '/notifications?page=2&limit=5', {
      token: investorToken,
    });
    expect(res.status).toBe(200);
    expect(res.data.meta.page).toBe(2);
    expect(res.data.meta.limit).toBe(5);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it('NB-05: unread-count is zero for a new user', async () => {
    const email = `qa-nb05-${Date.now()}@openreal.test`;
    const token = await createVerifiedUserAndLogin(
      adminToken,
      email,
      'QA NB05 User',
    );
    const unread = await api('GET', '/notifications/unread-count', { token });
    expect(unread.status).toBe(200);
    expect(unread.data.count).toBe(0);
  });

  it('NB-06/NB-09/NB-10: KYC approval creates COMPLIANCE notification and read APIs work', async () => {
    const email = `qa-kyc-notif-${Date.now()}@openreal.test`;
    const token = await createVerifiedUserAndLogin(
      adminToken,
      email,
      'QA KYC Notification User',
    );

    const initiated = await api('POST', '/users/me/verification/initiate', {
      token,
    });
    expect(initiated.status).toBe(201);

    const queuePending = await api(
      'GET',
      `/admin/kyc?status=PENDING_REVIEW&search=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    const queueInProgress = await api(
      'GET',
      `/admin/kyc?status=IN_PROGRESS&search=${encodeURIComponent(email)}`,
      { token: adminToken },
    );
    const verificationId =
      queuePending.data?.data?.[0]?.id ?? queueInProgress.data?.data?.[0]?.id;
    expect(verificationId).toBeDefined();

    const approved = await api('POST', `/admin/kyc/${verificationId}/approve`, {
      token: adminToken,
    });
    expect(approved.status).toBe(201);

    const notifications = await api('GET', '/notifications?limit=20', {
      token,
    });
    expect(notifications.status).toBe(200);
    const compliance = (notifications.data.data as any[]).find(
      (n) => n.type === 'COMPLIANCE',
    );
    expect(compliance).toBeDefined();

    const markOne = await api('PATCH', `/notifications/${compliance.id}/read`, {
      token,
    });
    expect(markOne.status).toBe(200);
    expect(markOne.data.success).toBe(true);

    const markAll = await api('PATCH', '/notifications/read-all', { token });
    expect(markAll.status).toBe(200);

    const unreadFinal = await api('GET', '/notifications/unread-count', {
      token,
    });
    expect(unreadFinal.status).toBe(200);
    expect(unreadFinal.data.count).toBe(0);
  });
});
