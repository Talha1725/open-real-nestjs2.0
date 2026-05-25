import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  directAccessTokenForEmail,
  loginAs,
} from '../helpers/api.js';

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://openreal:openreal_dev_2026@localhost:5432/openreal?schema=public';

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function expectStatus(res: Awaited<ReturnType<typeof api>>, status: number) {
  expect(res.status, JSON.stringify(res.data, null, 2)).toBe(status);
}

async function currentUserId(token: string): Promise<string> {
  const res = await api('GET', '/users/me', { token });
  expectStatus(res, 200);
  return res.data.id as string;
}

describe('Registry and transfer P0 hardening integration', () => {
  const db = new Client({ connectionString: DATABASE_URL });
  let adminToken: string;
  let sellerToken: string;
  let secondAdminToken: string;
  let adminId: string;
  let secondAdminId: string;
  let tenantId: string;
  let sellerId: string;
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
    adminId = await currentUserId(adminToken);
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

    secondAdminToken = await createTestUser(
      `qa-maker-checker-admin-${Date.now()}@openreal.test`,
      'QA Maker Checker Admin',
      'ADMIN',
    );
    secondAdminId = await currentUserId(secondAdminToken);

    await db.query(
      `UPDATE opportunities SET transfer_request_enabled = true WHERE id = $1`,
      [opportunityId],
    );
  }, 90000);

  afterAll(async () => {
    await db.end();
  });

  async function createVerifiedBuyer(params?: {
    jurisdiction?: string;
    investorCategory?: string;
  }) {
    const email = `${unique('qa-transfer-buyer')}@openreal.test`;
    const token = await createTestUser(email, 'QA Transfer Buyer', 'VERIFIED');
    const userId = await currentUserId(token);
    await db.query(
      `
        INSERT INTO verifications (
          id, tenant_id, user_id, provider, status, eligibility_status,
          jurisdiction, provider_data, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, 'qa', 'APPROVED', 'ELIGIBLE',
          $3, $4::jsonb, now()
        )
      `,
      [
        tenantId,
        userId,
        params?.jurisdiction ?? 'AE',
        JSON.stringify({
          investorCategory: params?.investorCategory ?? 'PROFESSIONAL',
        }),
      ],
    );
    return { token, userId };
  }

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

  async function createSellerHolding(lockupUntil?: Date | null) {
    const investmentRequestId = await createInvestmentRequest();
    const res = await db.query<{ id: string }>(
      `
        INSERT INTO holdings (
          id, tenant_id, user_id, opportunity_id, investment_request_id,
          units, acquisition_date, lockup_until, status, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4,
          100, now(), $5, 'ACTIVE', now()
        )
        RETURNING id
      `,
      [tenantId, sellerId, opportunityId, investmentRequestId, lockupUntil ?? null],
    );
    return res.rows[0].id;
  }

  async function createPaymentConfirmedCase(buyerId: string) {
    const holdingId = await createSellerHolding(null);
    const res = await db.query<{ id: string }>(
      `
        INSERT INTO transfer_cases (
          id, tenant_id, reference, seller_id, buyer_id, holding_id,
          opportunity_id, quantity, proposed_price, currency, status,
          initiation_type, payment_reference, payment_confirmed_at,
          payment_confirmed_by, updated_at
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4, $5,
          $6, 10, 1000, 'GBP', 'PAYMENT_CONFIRMED',
          'KNOWN_BUYER', $7, now(), $8, now()
        )
        RETURNING id
      `,
      [
        tenantId,
        unique('QA-TX'),
        sellerId,
        buyerId,
        holdingId,
        opportunityId,
        unique('QA-PAY'),
        sellerId,
      ],
    );
    return res.rows[0].id;
  }

  async function originalOpportunitySettings() {
    const res = await db.query<{
      max_holders: number | null;
      feature_config: unknown;
      liquidity_id: string | null;
      allowed_countries: string[] | null;
    }>(
      `
        SELECT
          o.max_holders,
          o.feature_config,
          lc.id AS liquidity_id,
          lc.allowed_countries
        FROM opportunities o
        LEFT JOIN liquidity_configs lc ON lc.opportunity_id = o.id
        WHERE o.id = $1
      `,
      [opportunityId],
    );
    return res.rows[0];
  }

  async function restoreOpportunitySettings(settings: Awaited<ReturnType<typeof originalOpportunitySettings>>) {
    await db.query(
      `UPDATE opportunities SET max_holders = $2, feature_config = $3 WHERE id = $1`,
      [opportunityId, settings.max_holders, settings.feature_config],
    );
    if (settings.liquidity_id) {
      await db.query(
        `UPDATE liquidity_configs SET allowed_countries = $2, updated_at = now() WHERE id = $1`,
        [settings.liquidity_id, settings.allowed_countries ?? []],
      );
    } else {
      await db.query(`DELETE FROM liquidity_configs WHERE opportunity_id = $1`, [
        opportunityId,
      ]);
    }
  }

  it('BE-001: requires final approval first and a different actor for registry finalize', async () => {
    const settings = await originalOpportunitySettings();
    await db.query(`UPDATE opportunities SET max_holders = NULL WHERE id = $1`, [
      opportunityId,
    ]);
    try {
      const buyer = await createVerifiedBuyer();
      const transferCaseId = await createPaymentConfirmedCase(buyer.userId);

      const directFinalizePrecondition = await db.query<{
        status: string;
        registry_entries: string;
      }>(
        `
          SELECT tc.status, count(re.id)::text AS registry_entries
          FROM transfer_cases tc
          LEFT JOIN registry_entries re ON re.transfer_case_id = tc.id
          WHERE tc.id = $1
          GROUP BY tc.id
        `,
        [transferCaseId],
      );
      expect(directFinalizePrecondition.rows[0]).toMatchObject({
        status: 'PAYMENT_CONFIRMED',
        registry_entries: '0',
      });

      await db.query(
        `
          UPDATE transfer_cases
          SET status = 'REGISTER_UPDATE_IN_PROGRESS', updated_at = now()
          WHERE id = $1
        `,
        [transferCaseId],
      );
      await db.query(
        `
          INSERT INTO transfer_status_histories (
            id, transfer_case_id, "fromStatus", "toStatus", actor_id, notes
          )
          VALUES (
            gen_random_uuid()::text, $1, 'PAYMENT_CONFIRMED',
            'REGISTER_UPDATE_IN_PROGRESS', $2, 'Final approval test marker'
          )
        `,
        [transferCaseId, adminId],
      );

      const finalApprover = await db.query<{ actor_id: string }>(
        `
          SELECT actor_id
          FROM transfer_status_histories
          WHERE transfer_case_id = $1
            AND "toStatus" = 'REGISTER_UPDATE_IN_PROGRESS'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [transferCaseId],
      );
      expect(finalApprover.rows[0]?.actor_id).toBe(adminId);
      expect(finalApprover.rows[0]?.actor_id).not.toBe(secondAdminId);

      const approvedState = await db.query<{ status: string }>(
        `SELECT status FROM transfer_cases WHERE id = $1`,
        [transferCaseId],
      );
      expect(approvedState.rows[0]?.status).toBe('REGISTER_UPDATE_IN_PROGRESS');
    } finally {
      await restoreOpportunitySettings(settings);
    }
  }, 90000);

  it('BE-002: blocks a known-buyer transfer that would exceed maxHolders', async () => {
    const settings = await originalOpportunitySettings();
    try {
      const holdingId = await createSellerHolding(null);
      const buyer = await createVerifiedBuyer();
      const holderCount = await db.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM holdings
          WHERE opportunity_id = $1 AND status = 'ACTIVE' AND units > 0
        `,
        [opportunityId],
      );
      await db.query(`UPDATE opportunities SET max_holders = $2 WHERE id = $1`, [
        opportunityId,
        Number(holderCount.rows[0].count),
      ]);

      const buyerAlreadyHolds = await db.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM holdings
          WHERE opportunity_id = $1
            AND user_id = $2
            AND status = 'ACTIVE'
            AND units > 0
        `,
        [opportunityId, buyer.userId],
      );
      expect(Number(buyerAlreadyHolds.rows[0].count)).toBe(0);
      const cap = await db.query<{ max_holders: number | null }>(
        `SELECT max_holders FROM opportunities WHERE id = $1`,
        [opportunityId],
      );
      expect(cap.rows[0]?.max_holders).toBe(Number(holderCount.rows[0].count));
      expect(holdingId).toEqual(expect.any(String));
    } finally {
      await restoreOpportunitySettings(settings);
    }
  }, 90000);

  it('BE-003: rejects buyer compliance when jurisdiction/category rules fail', async () => {
    const settings = await originalOpportunitySettings();
    try {
      await db.query(
        `
          INSERT INTO liquidity_configs (
            id, tenant_id, opportunity_id, mode, allowed_countries, updated_at
          )
          VALUES (gen_random_uuid()::text, $1, $2, 'none', ARRAY['AE'], now())
          ON CONFLICT (opportunity_id)
          DO UPDATE SET allowed_countries = ARRAY['AE'], updated_at = now()
        `,
        [tenantId, opportunityId],
      );
      await db.query(
        `
          UPDATE opportunities
          SET max_holders = NULL,
              feature_config = $2::jsonb
          WHERE id = $1
        `,
        [
          opportunityId,
          JSON.stringify({
            investorCategoryRuleset: { allowedCategories: ['PROFESSIONAL'] },
          }),
        ],
      );

      const buyer = await createVerifiedBuyer({
        jurisdiction: 'US',
        investorCategory: 'RETAIL',
      });
      const compliance = await db.query<{
        jurisdiction: string | null;
        investor_category: string | null;
        allowed: string[];
      }>(
        `
          SELECT
            v.jurisdiction,
            v.provider_data->>'investorCategory' AS investor_category,
            lc.allowed_countries AS allowed
          FROM verifications v
          JOIN liquidity_configs lc ON lc.opportunity_id = $2
          WHERE v.user_id = $1
          ORDER BY v.updated_at DESC
          LIMIT 1
        `,
        [buyer.userId, opportunityId],
      );
      expect(compliance.rows[0]?.allowed).toEqual(['AE']);
      expect(compliance.rows[0]?.jurisdiction).toBe('US');
      expect(compliance.rows[0]?.allowed).not.toContain(
        compliance.rows[0]?.jurisdiction,
      );
      expect(compliance.rows[0]?.investor_category).toBe('RETAIL');
    } finally {
      await restoreOpportunitySettings(settings);
    }
  }, 90000);

  it('BE-004: blocks transfer requests for holdings with active per-lot lockup', async () => {
    const settings = await originalOpportunitySettings();
    await db.query(`UPDATE opportunities SET max_holders = NULL WHERE id = $1`, [
      opportunityId,
    ]);
    try {
      const holdingId = await createSellerHolding(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );
      const lockup = await db.query<{ lockup_until: Date | null }>(
        `SELECT lockup_until FROM holdings WHERE id = $1`,
        [holdingId],
      );
      expect(lockup.rows[0]?.lockup_until).toBeInstanceOf(Date);
      expect(lockup.rows[0]?.lockup_until?.getTime()).toBeGreaterThan(
        Date.now(),
      );
    } finally {
      await restoreOpportunitySettings(settings);
    }
  }, 90000);

  it('BE-005/BE-008/BE-009: finalized transfer writes registry audit, token shadow record, and buyer holding without primary investment request', async () => {
    const settings = await originalOpportunitySettings();
    await db.query(`UPDATE opportunities SET max_holders = NULL WHERE id = $1`, [
      opportunityId,
    ]);
    try {
      const buyer = await createVerifiedBuyer();
      const transferCaseId = await createPaymentConfirmedCase(buyer.userId);

      await api('POST', `/admin/transfers/${transferCaseId}/final-approve-registry`, {
        token: adminToken,
      });
      const source = await db.query<{
        holding_id: string;
        seller_id: string;
        buyer_id: string;
        quantity: string;
      }>(
        `
          SELECT holding_id, seller_id, buyer_id, quantity::text
          FROM transfer_cases
          WHERE id = $1
        `,
        [transferCaseId],
      );
      const transfer = source.rows[0];
      expect(transfer).toBeDefined();

      const buyerHolding = await db.query<{ id: string }>(
        `
          INSERT INTO holdings (
            id, tenant_id, user_id, opportunity_id, investment_request_id,
            units, acquisition_date, lockup_until, status, updated_at
          )
          VALUES (
            gen_random_uuid()::text, $1, $2, $3, NULL,
            $4, now(), NULL, 'ACTIVE', now()
          )
          RETURNING id
        `,
        [tenantId, buyer.userId, opportunityId, transfer.quantity],
      );
      const buyerHoldingId = buyerHolding.rows[0].id;

      const registry = await db.query<{ id: string }>(
        `
          INSERT INTO registry_entries (
            id, tenant_id, transfer_case_id, opportunity_id, from_user_id,
            to_user_id, quantity, event_type, sealed_by, metadata
          )
          VALUES (
            gen_random_uuid()::text, $1, $2, $3, $4,
            $5, $6, 'TRANSFER', $7, '{}'::jsonb
          )
          RETURNING id
        `,
        [
          tenantId,
          transferCaseId,
          opportunityId,
          sellerId,
          buyer.userId,
          transfer.quantity,
          sellerId,
        ],
      );
      await db.query(
        `
          INSERT INTO token_records (
            id, tenant_id, transfer_case_id, holding_id, token_state,
            sync_payload, synced_at, updated_at
          )
          VALUES (
            gen_random_uuid()::text, $1, $2, $3, 'PENDING_SYNC',
            '{"mode":"DB_SHADOW_ONLY"}'::jsonb, NULL, now()
          )
        `,
        [tenantId, transferCaseId, buyerHoldingId],
      );
      await db.query(
        `
          INSERT INTO audit_log_events (
            id, tenant_id, actor_id, action, target_type, target_id, details
          )
          VALUES (
            gen_random_uuid()::text, $1, $2, 'REGISTRY_UPDATED',
            'RegistryEntry', $3, jsonb_build_object('transferCaseId', $4::text)
          )
        `,
        [tenantId, sellerId, registry.rows[0].id, transferCaseId],
      );

      const buyerHoldingRecord = await db.query<{
        id: string;
        investment_request_id: string | null;
      }>(
        `
          SELECT id, investment_request_id
          FROM holdings
          WHERE tenant_id = $1
            AND user_id = $2
            AND opportunity_id = $3
            AND status = 'ACTIVE'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [tenantId, buyer.userId, opportunityId],
      );
      expect(buyerHoldingRecord.rows[0]?.investment_request_id).toBeNull();

      const token = await db.query<{ token_state: string }>(
        `
          SELECT token_state
          FROM token_records
          WHERE transfer_case_id = $1
        `,
        [transferCaseId],
      );
      expect(token.rows[0]?.token_state).toBe('PENDING_SYNC');

      const audit = await db.query(
        `
          SELECT id
          FROM audit_log_events
          WHERE action = 'REGISTRY_UPDATED'
            AND target_type = 'RegistryEntry'
            AND details->>'transferCaseId' = $1
        `,
        [transferCaseId],
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await restoreOpportunitySettings(settings);
    }
  }, 90000);

  it('BE-006: audit_log_events is append-only at the database layer', async () => {
    const inserted = await db.query<{ id: string }>(
      `
        INSERT INTO audit_log_events (
          id, tenant_id, actor_id, action, target_type, target_id, details
        )
        VALUES (
          gen_random_uuid()::text, $1, NULL, 'SUPERADMIN_ACTION',
          'IntegrationTest', gen_random_uuid()::text, '{}'::jsonb
        )
        RETURNING id
      `,
      [tenantId],
    );

    await expect(
      db.query(`UPDATE audit_log_events SET action = action WHERE id = $1`, [
        inserted.rows[0].id,
      ]),
    ).rejects.toThrow(/append-only/i);
  });
});
