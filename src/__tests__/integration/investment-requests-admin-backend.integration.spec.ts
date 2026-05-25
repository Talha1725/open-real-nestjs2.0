import { beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

async function createRequestForInvestor(investorToken: string) {
  const listings = await api('GET', '/investor/listings?limit=25', {
    token: investorToken,
  });
  expect(listings.status).toBe(200);

  for (const opp of listings.data.data as Array<{ id: string }>) {
    const config = await api(
      'GET',
      `/investor/opportunities/${opp.id}/request-config`,
      { token: investorToken },
    );
    if (config.status !== 200) continue;

    const created = await api('POST', '/investor/investment-requests', {
      token: investorToken,
      body: {
        opportunityId: opp.id,
        amount: Number(config.data.minimumAmount),
        acknowledgements: config.data.acknowledgements,
      },
    });
    if (created.status === 201) return created.data.request.id as string;
  }
  throw new Error('Unable to create investment request for test');
}

describe('QA Report - Admin investment request backend', () => {
  let adminToken: string;
  let investorToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    await api('PATCH', '/admin/settings/integrations', {
      token: adminToken,
      body: {
        paymentConfig: {
          accountName: 'QA Test Account',
          iban: 'GB29NWBK60161331926819',
          bankName: 'QA Bank',
          swift: 'QATEST22',
        },
      },
    });
    investorToken = await createVerifiedUserAndLogin(
      adminToken,
      `qa-investment-admin-${Date.now()}@openreal.test`,
      'QA Investment Admin Investor',
      'VERIFIED',
    );
  }, 70000);

  it('INV-03/INV-05: confirm request and reject second confirm', async () => {
    const requestId = await createRequestForInvestor(investorToken);

    const confirm = await api(
      'POST',
      `/admin/investment-requests/${requestId}/confirm`,
      {
        token: adminToken,
        body: { reason: 'Payment received in bank reconciliation' },
      },
    );
    expect(confirm.status).toBe(201);
    expect(confirm.data.request.status).toBe('CONFIRMED');
    expect(confirm.data.holding.id).toBeDefined();

    const notifications = await api('GET', '/notifications?limit=20', {
      token: investorToken,
    });
    expect(notifications.status).toBe(200);
    const systemNotification = (notifications.data.data as any[]).find(
      (n) => n.type === 'SYSTEM',
    );
    expect(systemNotification).toBeDefined();

    const reconfirm = await api(
      'POST',
      `/admin/investment-requests/${requestId}/confirm`,
      {
        token: adminToken,
        body: { reason: 'Second confirm should fail' },
      },
    );
    expect(reconfirm.status).toBe(400);
  });

  it('INV-04: fail request flow works', async () => {
    const requestId = await createRequestForInvestor(investorToken);

    const failed = await api(
      'POST',
      `/admin/investment-requests/${requestId}/fail`,
      {
        token: adminToken,
        body: { reason: 'Funds not received before cutoff' },
      },
    );
    expect(failed.status).toBe(201);
    expect(failed.data.status).toBe('FAILED');

    const notifications = await api('GET', '/notifications?limit=20', {
      token: investorToken,
    });
    expect(notifications.status).toBe(200);
    const systemNotification = (notifications.data.data as any[]).find(
      (n) => n.type === 'SYSTEM',
    );
    expect(systemNotification).toBeDefined();
  });
});
