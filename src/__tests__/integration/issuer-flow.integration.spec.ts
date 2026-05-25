// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('Issuer Flow', () => {
  let issuerToken: string;
  let opportunityId: string;

  beforeAll(async () => {
    issuerToken = await loginAs('issuer');
  });

  it('GET /issuer/dashboard returns issuer org info and counts', async () => {
    const { status, data } = await api('GET', '/issuer/dashboard', {
      token: issuerToken,
    });

    expect(status).toBe(200);
    expect(data.organisation).toBeDefined();
    expect(data.organisation.name).toBe('Test Issuer Corp');
    expect(data.opportunityCounts).toBeDefined();
    expect(data.recentOpportunities).toBeDefined();
  });

  it('GET /issuer/profile returns org info', async () => {
    const { status, data } = await api('GET', '/issuer/profile', {
      token: issuerToken,
    });

    expect(status).toBe(200);
    expect(data.name).toBe('Test Issuer Corp');
    expect(data.registrationNumber).toBe('ISS-2026-001');
    expect(data.countryOfIncorporation).toBe('United Kingdom');
  });

  it('POST /issuer/opportunities creates a draft', async () => {
    const { status, data } = await api('POST', '/issuer/opportunities', {
      token: issuerToken,
      body: {
        title: `Test Opportunity ${Date.now()}`,
        summary: 'A test opportunity created by integration tests',
        assetClass: 'REAL_ESTATE',
        region: 'EUROPE',
        currency: 'GBP',
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.status).toBe('DRAFT');

    opportunityId = data.id;
  });

  it('PATCH /issuer/opportunities/:id updates the draft', async () => {
    const { status, data } = await api(
      'PATCH',
      `/issuer/opportunities/${opportunityId}`,
      {
        token: issuerToken,
        body: {
          investmentThesis: '<p>Great investment opportunity</p>',
          whatYouAreBuying: '<p>Office space in prime location</p>',
          risks: '<p>Market risk and liquidity risk apply</p>',
          feesAndConflicts: '<p>1.5% annual management fee</p>',
        },
      },
    );

    expect(status).toBe(200);
    expect(data.id).toBe(opportunityId);
  });

  it('GET /issuer/opportunities/:id returns detail with updated fields', async () => {
    const { status, data } = await api(
      'GET',
      `/issuer/opportunities/${opportunityId}`,
      { token: issuerToken },
    );

    expect(status).toBe(200);
    expect(data.investmentThesis).toContain('Great investment');
    expect(data.whatYouAreBuying).toContain('Office space');
    expect(data.risks).toContain('Market risk');
    expect(data.feesAndConflicts).toContain('management fee');
    expect(data.status).toBe('DRAFT');
  });

  it('GET /issuer/opportunities lists opportunities including the draft', async () => {
    const { status, data } = await api('GET', '/issuer/opportunities', {
      token: issuerToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);

    const draft = data.data.find((o: any) => o.id === opportunityId);
    expect(draft).toBeDefined();
    expect(draft.status).toBe('DRAFT');
  });

  it('POST /issuer/opportunities/:id/submit submits for review', async () => {
    const { status, data } = await api(
      'POST',
      `/issuer/opportunities/${opportunityId}/submit`,
      { token: issuerToken },
    );

    expect(status).toBe(201);
    expect(data.status).toBe('SUBMITTED');
    expect(data.submittedAt).toBeDefined();
  });

  it('PATCH /issuer/opportunities/:id rejects edit after submission', async () => {
    const { status } = await api(
      'PATCH',
      `/issuer/opportunities/${opportunityId}`,
      {
        token: issuerToken,
        body: { title: 'Should not work' },
      },
    );

    expect(status).toBe(400);
  });
});
