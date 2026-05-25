import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('QA Report - Admin opportunities backend', () => {
  let adminToken: string;
  let investorToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    investorToken = await loginAs('investor');
  }, 70000);

  it('OPP-05: approving opportunity in invalid status returns 400', async () => {
    const listings = await api('GET', '/investor/listings?limit=10', {
      token: investorToken,
    });
    expect(listings.status).toBe(200);
    const liveOpportunityId = listings.data?.data?.[0]?.id;
    expect(liveOpportunityId).toBeDefined();

    const approve = await api(
      'POST',
      `/admin/opportunities/${liveOpportunityId}/approve`,
      {
        token: adminToken,
      },
    );
    expect(approve.status).toBe(400);
  });
});
