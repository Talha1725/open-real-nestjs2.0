// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, createVerifiedUserAndLogin, loginAs } from '../helpers/api.js';

describe('Complete Investor Flow', () => {
  let investorToken: string;
  let adminToken: string;
  let opportunityId: string;
  let requestAmount: number;
  let acknowledgements: string[];
  let requestId: string;

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
      `qa-investor-flow-${Date.now()}@openreal.test`,
      'QA Investor Flow',
      'VERIFIED',
    );
  }, 70000);

  it('GET /investor/home returns personalized dashboard for verified user', async () => {
    const { status, data } = await api('GET', '/investor/home', {
      token: investorToken,
    });

    expect(status).toBe(200);
    expect(data.greeting).toBeDefined();
    expect(data.userStatus).toBeDefined();
    expect(data.userStatus.role).toBe('VERIFIED');
    expect(data.actions).toBeDefined();
    // Verified user should get portfolio and featured opportunities
    expect(data.portfolio).toBeDefined();
    expect(data.featuredOpportunities).toBeDefined();
  });

  it('GET /investor/listings returns paginated opportunities', async () => {
    const { status, data } = await api('GET', '/investor/listings', {
      token: investorToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toBeDefined();
    expect(data.meta.page).toBe(1);
    expect(data.meta.total).toBeGreaterThanOrEqual(1);

    // Save a requestable opportunity for subsequent tests.
    opportunityId = data.data[0].id;
    expect(opportunityId).toBeDefined();
  });

  it('GET /investor/opportunities/:id returns full detail', async () => {
    const { status, data } = await api(
      'GET',
      `/investor/opportunities/${opportunityId}`,
      { token: investorToken },
    );

    expect(status).toBe(200);
    expect(data.title).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(data.investmentThesis).toBeDefined();
    expect(data.assetClass).toBeDefined();
    expect(data.region).toBeDefined();
  });

  it('GET /investor/opportunities/:id/documents returns document list', async () => {
    const { status, data } = await api(
      'GET',
      `/investor/opportunities/${opportunityId}/documents`,
      { token: investorToken },
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /investor/opportunities/:id/similar returns similar opportunities', async () => {
    const { status, data } = await api(
      'GET',
      `/investor/opportunities/${opportunityId}/similar`,
      { token: investorToken },
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /investor/opportunities/:id/request-config returns investment config', async () => {
    const { status, data } = await api(
      'GET',
      `/investor/opportunities/${opportunityId}/request-config`,
      { token: investorToken },
    );

    expect(status).toBe(200);
    expect(data.currency).toBeDefined();
    requestAmount = Number(data.minimumAmount);
    acknowledgements = data.acknowledgements;
  });

  it('POST /investor/investment-requests creates a request', async () => {
    const { status, data } = await api(
      'POST',
      '/investor/investment-requests',
      {
        token: investorToken,
        body: {
          opportunityId,
          amount: requestAmount,
          acknowledgements,
        },
      },
    );

    expect(status).toBe(201);
    expect(data.request).toBeDefined();
    expect(data.request.referenceNumber).toBeDefined();
    expect(data.request.status).toBe('REQUEST_CREATED');
    expect(data.paymentInstruction).toBeDefined();
    expect(data.paymentInstruction.receivingAccountName).toBeDefined();
    expect(data.paymentInstruction.receivingAccountIban).toBeDefined();

    requestId = data.request.id;
  });

  it('GET /investor/investment-requests lists my requests', async () => {
    const { status, data } = await api('GET', '/investor/investment-requests', {
      token: investorToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /investor/investment-requests/:id returns request detail', async () => {
    const { status, data } = await api(
      'GET',
      `/investor/investment-requests/${requestId}`,
      { token: investorToken },
    );

    expect(status).toBe(200);
    expect(data.status).toBeDefined();
    expect(data.paymentInstruction).toBeDefined();
    expect(data.opportunity).toBeDefined();
  });

  it('GET /investor/portfolio returns portfolio data', async () => {
    const { status, data } = await api('GET', '/investor/portfolio', {
      token: investorToken,
    });

    expect(status).toBe(200);
    expect(data.kpis).toBeDefined();
    expect(typeof data.kpis.totalHoldings).toBe('number');
    expect(typeof data.kpis.totalValue).toBe('number');
  });

  it('POST /support/tickets creates a support ticket', async () => {
    const { status, data } = await api('POST', '/support/tickets', {
      token: investorToken,
      body: {
        subject: 'Question about my investment',
        message:
          'I submitted an investment request but have not received confirmation yet. Can you help?',
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.subject).toBe('Question about my investment');
    expect(data.status).toBe('OPEN');
  });

  it('GET /support/tickets lists my tickets', async () => {
    const { status, data } = await api('GET', '/support/tickets', {
      token: investorToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });
});
