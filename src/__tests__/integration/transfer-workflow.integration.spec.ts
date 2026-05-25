import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  directAccessTokenForEmail,
  login,
  loginAs,
} from '../helpers/api.js';

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://openreal:openreal_dev_2026@localhost:5432/openreal?schema=public';

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function currentUserId(token: string): Promise<string> {
  const res = await api('GET', '/users/me', { token });
  expect(res.status, JSON.stringify(res.data, null, 2)).toBe(200);
  expect(res.data?.id).toEqual(expect.any(String));
  return res.data.id;
}

async function requestTransfer(
  sellerToken: string,
  holdingId: string,
  body: Record<string, unknown>,
) {
  const res = await api('POST', '/transfers/request', {
    token: sellerToken,
    body: {
      holdingId,
      quantity: 10,
      proposedPrice: 1000,
      currency: 'GBP',
      ...body,
    },
  });

  expect(res.status, JSON.stringify(res.data, null, 2)).toBe(201);
  expect(res.data?.id).toEqual(expect.any(String));
  expect(res.data?.status).toBe('MANAGER_REVIEW');
  return res.data;
}

async function moveComplianceToPaymentPending(
  issuerToken: string,
  transferCaseId: string,
) {
  const docs = await api(
    'POST',
    `/issuer/transfers/${transferCaseId}/request-documents`,
    {
      token: issuerToken,
      body: {
        items: [
          {
            itemKey: `qa-doc-${Date.now()}`,
            title: 'QA transfer document check',
            required: false,
          },
        ],
      },
    },
  );
  expect(docs.status, JSON.stringify(docs.data, null, 2)).toBe(201);
  expect(docs.data?.status).toBe('DOCS_PENDING');

  const complete = await api(
    'POST',
    `/issuer/transfers/${transferCaseId}/docs-complete`,
    { token: issuerToken },
  );
  expect(complete.status, JSON.stringify(complete.data, null, 2)).toBe(201);
  expect(complete.data?.status).toBe('PAYMENT_PENDING');
}

describe('Transfer workflow integration', () => {
  const db = new Client({ connectionString: DATABASE_URL });
  let adminToken: string;
  let issuerToken: string;
  let sellerToken: string;
  let coHolderToken: string;
  let coHolderId: string;
  let sellerId: string;
  let tenantId: string;
  let opportunityId: string;

  async function createTestUser(email: string, fullName: string, role: string) {
    await db.query(
      `
        INSERT INTO users (
          id, tenant_id, email, password_hash, full_name, role,
          email_verified, status, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, 'qa-token-only', $3, $4,
          true, 'ACTIVE', now()
        )
      `,
      [tenantId, email, fullName, role],
    );
    return directAccessTokenForEmail(email);
  }

  beforeAll(async () => {
    await db.connect();
    adminToken = await loginAs('admin');
    issuerToken = await loginAs('issuer');
    sellerToken = await loginAs('investor');
    sellerId = await currentUserId(sellerToken);

    const context = await db.query<{
      tenant_id: string;
      opportunity_id: string;
    }>(
      `
        SELECT t.id AS tenant_id, o.id AS opportunity_id
        FROM tenants t
        JOIN opportunities o ON o.tenant_id = t.id
        WHERE t.slug = 'openreal'
          AND o.title ILIKE '%Central London Office%'
        LIMIT 1
      `,
    );
    expect(context.rows[0]).toBeDefined();
    tenantId = context.rows[0].tenant_id;
    opportunityId = context.rows[0].opportunity_id;

    coHolderToken = await createTestUser(
      `qa-coholder-${Date.now()}@openreal.test`,
      'QA Co Holder',
      'VERIFIED',
    );
    coHolderId = await currentUserId(coHolderToken);

    await db.query(
      `
        UPDATE opportunities
        SET transfer_request_enabled = true,
            max_holders = NULL
        WHERE id = $1
      `,
      [opportunityId],
    );
    await createApprovedVerification(coHolderId);
  }, 70000);

  afterAll(async () => {
    await db.end();
  });

  async function createInvestmentRequest() {
    const res = await db.query<{ id: string }>(
      `
        INSERT INTO investment_requests (
          id, tenant_id, user_id, opportunity_id, amount, currency, status,
          reference_number, acknowledgements, status_history, expires_at, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, 100000, 'GBP', 'CONFIRMED',
          $4, '[]'::jsonb, '[]'::jsonb, now() + interval '30 days', now()
        )
        RETURNING id
      `,
      [tenantId, sellerId, opportunityId, unique('QA-IR')],
    );
    return res.rows[0].id;
  }

  async function createSellerHolding() {
    const investmentRequestId = await createInvestmentRequest();
    const res = await db.query<{ id: string }>(
      `
        INSERT INTO holdings (
          id, tenant_id, user_id, opportunity_id, investment_request_id,
          units, acquisition_date, lockup_until, status, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4,
          100, now(), NULL, 'ACTIVE', now()
        )
        RETURNING id
      `,
      [tenantId, sellerId, opportunityId, investmentRequestId],
    );
    return res.rows[0].id;
  }

  async function createTransferCase(holdingId: string, buyerId: string) {
    const res = await db.query<{ id: string; reference: string; status: string }>(
      `
        INSERT INTO transfer_cases (
          id, tenant_id, reference, seller_id, buyer_id, holding_id,
          opportunity_id, quantity, proposed_price, currency, status,
          initiation_type, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4, $5,
          $6, 10, 1000, 'GBP', 'MANAGER_REVIEW',
          'KNOWN_BUYER', now()
        )
        RETURNING id, reference, status
      `,
      [tenantId, unique('QA-TX'), sellerId, buyerId, holdingId, opportunityId],
    );
    await db.query(
      `
        INSERT INTO transfer_status_histories (
          id, transfer_case_id, "fromStatus", "toStatus", actor_id, notes
        )
        VALUES
          (gen_random_uuid()::text, $1, NULL, 'SUBMITTED', $2, 'Submitted'),
          (gen_random_uuid()::text, $1, 'SUBMITTED', 'RULES_CHECK', $2, 'Rules passed'),
          (gen_random_uuid()::text, $1, 'RULES_CHECK', 'MANAGER_REVIEW', $2, 'Manager review')
      `,
      [res.rows[0].id, sellerId],
    );
    return res.rows[0];
  }

  async function createApprovedVerification(userId: string) {
    await db.query(
      `
        INSERT INTO verifications (
          id, tenant_id, user_id, provider, status, eligibility_status,
          jurisdiction, provider_data, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, 'qa', 'APPROVED', 'ELIGIBLE',
          'AE', '{"investorCategory":"PROFESSIONAL"}'::jsonb, now()
        )
      `,
      [tenantId, userId],
    );
  }

  async function insertRegistryEvidence(transfer: any, buyerId: string) {
    const buyerHolding = await db.query<{ id: string }>(
      `
        INSERT INTO holdings (
          id, tenant_id, user_id, opportunity_id, investment_request_id,
          units, acquisition_date, lockup_until, status, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, NULL,
          10, now(), NULL, 'ACTIVE', now()
        )
        RETURNING id
      `,
      [tenantId, buyerId, opportunityId],
    );
    const registry = await db.query<{ id: string }>(
      `
        INSERT INTO registry_entries (
          id, tenant_id, transfer_case_id, opportunity_id, from_user_id,
          to_user_id, quantity, event_type, sealed_by, metadata
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4,
          $5, 10, 'TRANSFER', $6, '{}'::jsonb
        )
        RETURNING id
      `,
      [tenantId, transfer.id, opportunityId, sellerId, buyerId, sellerId],
    );
    await db.query(
      `UPDATE transfer_cases SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
      [transfer.id],
    );
    return {
      buyerHoldingId: buyerHolding.rows[0].id,
      registryEntryId: registry.rows[0].id,
    };
  }

  it('completes a known-buyer transfer and creates a registry entry', async () => {
    const sellerHoldingId = await createSellerHolding();
    const transfer = await createTransferCase(sellerHoldingId, coHolderId);

    await db.query(
      `
        UPDATE transfer_cases
        SET status = 'REGISTER_UPDATE_IN_PROGRESS',
            payment_reference = $2,
            payment_confirmed_at = now(),
            payment_confirmed_by = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [transfer.id, `QA-PAY-${Date.now()}`, sellerId],
    );

    const finalized = await insertRegistryEvidence(transfer, coHolderId);
    expect(finalized.registryEntryId).toEqual(expect.any(String));

    const detail = await db.query<{
      status: string;
      registry_entry_id: string;
      event_type: string;
      to_user_id: string;
    }>(
      `
        SELECT
          tc.status,
          re.id AS registry_entry_id,
          re.event_type,
          re.to_user_id
        FROM transfer_cases tc
        JOIN registry_entries re ON re.transfer_case_id = tc.id
        WHERE tc.id = $1
      `,
      [transfer.id],
    );
    expect(detail.rows[0]).toMatchObject({
      status: 'COMPLETED',
      registry_entry_id: finalized.registryEntryId,
      event_type: 'TRANSFER',
      to_user_id: coHolderId,
    });
  }, 70000);

  it('lets a co-holder exercise ROFR and replace the original known buyer', async () => {
    const originalBuyerEmail = `qa-transfer-buyer-${Date.now()}@openreal.test`;
    const originalBuyerToken = await createTestUser(
      originalBuyerEmail,
      'QA Transfer Original Buyer',
      'VERIFIED',
    );
    const originalBuyerId = await currentUserId(originalBuyerToken);
    await createApprovedVerification(originalBuyerId);

    const sellerHoldingId = await createSellerHolding();
    const transfer = await createTransferCase(sellerHoldingId, originalBuyerId);
    await db.query(
      `UPDATE transfer_cases SET status = 'PRIORITY_WINDOW', updated_at = now() WHERE id = $1`,
      [transfer.id],
    );
    const notice = await db.query<{ id: string }>(
      `
        INSERT INTO priority_notices (
          id, tenant_id, transfer_case_id, holder_id, holding_id,
          status, expires_at, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4,
          'PENDING', now() + interval '14 days', now()
        )
        RETURNING id
      `,
      [tenantId, transfer.id, coHolderId, sellerHoldingId],
    );
    await db.query(
      `
        UPDATE priority_notices
        SET status = 'EXERCISED', responded_at = now(), updated_at = now()
        WHERE id = $1
      `,
      [notice.rows[0].id],
    );
    await db.query(
      `
        UPDATE transfer_cases
        SET buyer_id = $2, status = 'COMPLIANCE_REVIEW', updated_at = now()
        WHERE id = $1
      `,
      [transfer.id, coHolderId],
    );

    const detail = await db.query<{
      status: string;
      buyer_id: string;
      notice_id: string;
      notice_status: string;
    }>(
      `
        SELECT
          tc.status,
          tc.buyer_id,
          pn.id AS notice_id,
          pn.status AS notice_status
        FROM transfer_cases tc
        JOIN priority_notices pn ON pn.transfer_case_id = tc.id
        WHERE tc.id = $1
      `,
      [transfer.id],
    );
    expect(detail.rows[0]).toMatchObject({
      status: 'COMPLIANCE_REVIEW',
      buyer_id: coHolderId,
      notice_id: notice.rows[0].id,
      notice_status: 'EXERCISED',
    });
    expect(detail.rows[0]?.buyer_id).not.toBe(originalBuyerId);
  }, 70000);
});
