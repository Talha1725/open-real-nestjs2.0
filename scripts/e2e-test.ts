/**
 * OpenReal API — End-to-End Test Script
 *
 * Runs against the live server and validates:
 *   Part 1: Transfer workflow happy path
 *   Part 2: Transfer edge cases
 *   Part 3: Cap table viewer
 *   Part 4: Feature config CRUD
 *   Part 5: Dormant market layer
 *   Part 6: Market overview stubs
 *   Part 7: RBAC for new roles
 *
 * Usage: npx tsx scripts/e2e-test.ts
 */

const BASE_URL =
  process.env.E2E_BASE_URL ?? 'https://openreal.io/api/v1';

// ── Credentials ─────────────────────────────────────────────────────────────

const USERS = {
  investor1: { email: 'investor@openreal.io', password: 'Investor123!' },
  investor2: { email: 'investor2@openreal.io', password: 'Investor123!' },
  issuer: { email: 'issuer@openreal.io', password: 'Issuer123!' },
  admin: { email: 'tenantadmin@openreal.io', password: 'TenantAdmin123!' },
  superAdmin: { email: 'admin@openreal.io', password: 'Admin123!' },
  spvManager: { email: 'spvmanager@openreal.io', password: 'SpvManager123!' },
  compliance: { email: 'compliance@openreal.io', password: 'Compliance123!' },
};

// ── Types ───────────────────────────────────────────────────────────────────

interface TestResult {
  part: string;
  name: string;
  passed: boolean;
  status?: number;
  detail?: string;
}

interface Tokens {
  [role: string]: string;
}

// ── Globals ─────────────────────────────────────────────────────────────────

const results: TestResult[] = [];
const tokens: Tokens = {};

// IDs discovered at runtime
let transferEnabledOppId = '';
let lockedOppId = '';
let investor1HoldingId = ''; // 500 units on transfer-enabled opp
let investor1LockedHoldingId = ''; // 300 units on locked opp
let investor2Id = ''; // buyer for assign-buyer
let transferCaseId = ''; // created in Part 1

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ status: number; data: any }> {
  const url = new URL(`${BASE_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: any;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

function record(
  part: string,
  name: string,
  passed: boolean,
  status?: number,
  detail?: string,
) {
  results.push({ part, name, passed, status, detail });
  const icon = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const d = detail ? ` — ${detail}` : '';
  console.log(`  [${icon}] ${name}${d}`);
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function login(
  role: string,
  email: string,
  password: string,
): Promise<boolean> {
  const { status, data } = await api('POST', '/auth/login', {
    body: { email, password },
  });

  if (status === 429) {
    // Rate limited — wait and retry once
    console.log(`    (rate limited for ${role}, waiting 5s...)`);
    await sleep(5000);
    const retry = await api('POST', '/auth/login', {
      body: { email, password },
    });
    if (retry.status === 200 && retry.data.accessToken) {
      tokens[role] = retry.data.accessToken;
      return true;
    }
    return false;
  }

  if (status === 200 && data.accessToken) {
    tokens[role] = data.accessToken;
    return true;
  }
  return false;
}

// ── Part 0: Setup — Login all users and discover IDs ────────────────────────

async function setup() {
  console.log('\n=== SETUP: Login & discover IDs ===\n');

  // Login users sequentially with small delays to avoid rate limit
  for (const [role, creds] of Object.entries(USERS)) {
    const ok = await login(role, creds.email, creds.password);
    record(
      'SETUP',
      `Login ${role}`,
      ok,
      ok ? 200 : 0,
      ok ? '' : `user may not be seeded or rate limited`,
    );
    await sleep(300); // small delay between logins
  }

  // Discover opportunity IDs via admin list — must pass ?status=LIVE
  // (default filter is SUBMITTED/UNDER_REVIEW)
  if (tokens.admin) {
    const { status: oppStatus, data: oppData } = await api(
      'GET',
      '/admin/opportunities',
      { token: tokens.admin, query: { status: 'LIVE' } },
    );

    if (oppStatus === 200) {
      const opps = oppData.data ?? oppData;
      for (const opp of Array.isArray(opps) ? opps : []) {
        if (opp.title === 'Central London Office Complex') {
          transferEnabledOppId = opp.id;
        }
        if (opp.title?.includes('Abu Dhabi Logistics Hub')) {
          lockedOppId = opp.id;
        }
      }
      record(
        'SETUP',
        'Discover opportunity IDs',
        !!transferEnabledOppId,
        oppStatus,
        `transfer-enabled=${transferEnabledOppId ? 'found' : 'MISSING'}, locked=${lockedOppId ? 'found' : 'MISSING'}`,
      );
    } else {
      record(
        'SETUP',
        'Discover opportunity IDs',
        false,
        oppStatus,
        JSON.stringify(oppData).slice(0, 200),
      );
    }
  } else {
    record('SETUP', 'Discover opportunity IDs', false, 0, 'no admin token');
  }

  // Discover holding IDs via investor portfolio
  // Response shape: { kpis, holdings: [{ id, units, opportunity: { title } }], meta }
  if (tokens.investor1) {
    const { status: pfStatus, data: pfData } = await api(
      'GET',
      '/investor/portfolio',
      { token: tokens.investor1 },
    );

    if (pfStatus === 200) {
      const holdings = pfData.holdings ?? [];
      for (const h of holdings) {
        const title: string = h.opportunity?.title ?? '';
        if (title === 'Central London Office Complex' && Number(h.units) >= 500) {
          investor1HoldingId = h.id;
        }
        if (title.includes('Abu Dhabi Logistics Hub')) {
          investor1LockedHoldingId = h.id;
        }
      }
      record(
        'SETUP',
        'Discover investor1 holdings',
        !!investor1HoldingId,
        pfStatus,
        `transfer-holding=${investor1HoldingId ? 'found' : 'MISSING'}, locked-holding=${investor1LockedHoldingId ? 'found' : 'MISSING'}`,
      );
    } else {
      record(
        'SETUP',
        'Discover investor1 holdings',
        false,
        pfStatus,
        JSON.stringify(pfData).slice(0, 200),
      );
    }
  } else {
    record(
      'SETUP',
      'Discover investor1 holdings',
      false,
      0,
      'no investor1 token',
    );
  }

  // Discover investor2 user ID from cap table
  // Response shape: { holdings: [{ holdingId, userId, userEmail, ... }] }
  if (transferEnabledOppId && tokens.admin) {
    const { status: ctStatus, data: ctData } = await api(
      'GET',
      `/admin/opportunities/${transferEnabledOppId}/cap-table`,
      { token: tokens.admin },
    );

    if (ctStatus === 200) {
      const holders = ctData.holdings ?? [];
      for (const h of holders) {
        if (h.userEmail === 'investor2@openreal.io') {
          investor2Id = h.userId;
        }
      }
      record(
        'SETUP',
        'Discover investor2 ID from cap table',
        !!investor2Id,
        ctStatus,
        investor2Id ? `id=${investor2Id}` : 'MISSING — investor2 may not be seeded',
      );
    } else {
      record(
        'SETUP',
        'Discover investor2 ID from cap table',
        false,
        ctStatus,
      );
    }
  }
}

// ── Part 1: Transfer Workflow Happy Path ────────────────────────────────────

async function part1_transferHappyPath() {
  console.log('\n=== PART 1: Transfer Workflow Happy Path ===\n');

  if (!investor1HoldingId) {
    record(
      'PART 1',
      'SKIP — no holding ID discovered',
      false,
      0,
      'need seeded data',
    );
    return;
  }

  // 1.1 Create transfer request
  const { status: s1, data: d1 } = await api('POST', '/transfers/request', {
    token: tokens.investor1,
    body: {
      holdingId: investor1HoldingId,
      quantity: 50,
      proposedPrice: 50000,
      currency: 'GBP',
    },
  });
  const createOk = s1 === 201 && d1.id;
  if (createOk) transferCaseId = d1.id;
  record(
    'PART 1',
    '1.1 Create transfer request (50 units)',
    createOk,
    s1,
    createOk ? `id=${transferCaseId}` : JSON.stringify(d1).slice(0, 200),
  );

  if (!transferCaseId) return;

  // 1.2 Get transfer detail
  const { status: s2, data: d2 } = await api(
    'GET',
    `/transfers/${transferCaseId}`,
    { token: tokens.investor1 },
  );
  record(
    'PART 1',
    '1.2 Get transfer detail',
    s2 === 200 && (d2.status === 'PENDING_APPROVAL' || d2.status === 'MANAGER_REVIEW'),
    s2,
    `status=${d2.status}`,
  );

  // 1.3 List my transfers
  const { status: s3, data: d3 } = await api('GET', '/transfers', {
    token: tokens.investor1,
  });
  const myTransfers = d3.data ?? d3;
  record(
    'PART 1',
    '1.3 List my transfers',
    s3 === 200 && Array.isArray(myTransfers) && myTransfers.length > 0,
    s3,
  );

  // 1.4 Issuer lists transfers
  if (tokens.issuer) {
    const { status: s4 } = await api('GET', '/issuer/transfers', {
      token: tokens.issuer,
    });
    record('PART 1', '1.4 Issuer list transfers', s4 === 200, s4);
  } else {
    record('PART 1', '1.4 Issuer list transfers', false, 0, 'no issuer token');
  }

  // 1.5 Issuer approves transfer (ROFR enabled)
  if (tokens.issuer) {
    const { status: s5, data: d5 } = await api(
      'POST',
      `/issuer/transfers/${transferCaseId}/approve`,
      {
        token: tokens.issuer,
        body: { rofrEnabled: true },
      },
    );
    record(
      'PART 1',
      '1.5 Issuer approve (ROFR on)',
      s5 === 200 || s5 === 201,
      s5,
      `newStatus=${d5.status ?? d5.message ?? JSON.stringify(d5).slice(0, 100)}`,
    );
  } else {
    record('PART 1', '1.5 Issuer approve', false, 0, 'no issuer token');
  }

  // 1.6 Check priority notices for investor2
  if (tokens.investor2) {
    const { status: s6, data: d6 } = await api(
      'GET',
      '/transfers/priority-notices/mine',
      { token: tokens.investor2 },
    );
    const notices = d6.data ?? d6;
    const hasNotice =
      s6 === 200 && Array.isArray(notices) && notices.length > 0;
    let noticeId = '';
    if (hasNotice) noticeId = notices[0].id;
    record(
      'PART 1',
      '1.6 Investor2 has ROFR priority notice',
      hasNotice,
      s6,
      hasNotice ? `noticeId=${noticeId}` : 'no notices found',
    );

    // 1.7 Investor2 waives ROFR
    if (noticeId) {
      const { status: s7, data: d7 } = await api(
        'POST',
        `/transfers/priority-notices/${noticeId}/waive`,
        { token: tokens.investor2 },
      );
      record(
        'PART 1',
        '1.7 Investor2 waives ROFR',
        s7 === 200 || s7 === 201,
        s7,
        d7.status ?? d7.message ?? '',
      );
    } else {
      record(
        'PART 1',
        '1.7 Investor2 waives ROFR',
        false,
        0,
        'no notice to waive',
      );
    }
  } else {
    record(
      'PART 1',
      '1.6 Investor2 ROFR notice check',
      false,
      0,
      'no investor2 token',
    );
    record(
      'PART 1',
      '1.7 Investor2 waives ROFR',
      false,
      0,
      'no investor2 token',
    );
  }

  // 1.8 Admin lists transfers
  const { status: s8 } = await api('GET', '/admin/transfers', {
    token: tokens.admin,
  });
  record('PART 1', '1.8 Admin list all transfers', s8 === 200, s8);

  // 1.9 Admin assigns buyer
  if (investor2Id) {
    const { status: s9, data: d9 } = await api(
      'POST',
      `/admin/transfers/${transferCaseId}/assign-buyer`,
      {
        token: tokens.admin,
        body: { buyerId: investor2Id },
      },
    );
    record(
      'PART 1',
      '1.9 Admin assign buyer',
      s9 === 200 || s9 === 201,
      s9,
      d9.status ?? d9.message ?? JSON.stringify(d9).slice(0, 100),
    );
  } else {
    record(
      'PART 1',
      '1.9 Admin assign buyer',
      false,
      0,
      'no investor2 ID',
    );
  }

  // 1.10 Admin marks docs complete
  const { status: s10, data: d10 } = await api(
    'POST',
    `/admin/transfers/${transferCaseId}/docs-complete`,
    { token: tokens.admin },
  );
  record(
    'PART 1',
    '1.10 Admin docs complete',
    s10 === 200 || s10 === 201,
    s10,
    d10.status ?? d10.message ?? JSON.stringify(d10).slice(0, 100),
  );

  // 1.11 Admin confirms payment
  const { status: s11, data: d11 } = await api(
    'POST',
    `/admin/transfers/${transferCaseId}/confirm-payment`,
    {
      token: tokens.admin,
      body: {
        paymentReference: 'PAY-E2E-001',
        notes: 'E2E test payment confirmation',
      },
    },
  );
  record(
    'PART 1',
    '1.11 Admin confirm payment',
    s11 === 200 || s11 === 201,
    s11,
    d11.status ?? d11.message ?? JSON.stringify(d11).slice(0, 100),
  );

  // 1.12 Admin finalizes transfer
  const { status: s12, data: d12 } = await api(
    'POST',
    `/admin/transfers/${transferCaseId}/finalize`,
    { token: tokens.admin },
  );
  record(
    'PART 1',
    '1.12 Admin finalize transfer',
    s12 === 200 || s12 === 201,
    s12,
    d12.status ?? d12.message ?? JSON.stringify(d12).slice(0, 100),
  );

  // 1.13 Verify final status is COMPLETED
  const { status: s13, data: d13 } = await api(
    'GET',
    `/admin/transfers/${transferCaseId}`,
    { token: tokens.admin },
  );
  record(
    'PART 1',
    '1.13 Transfer final status = COMPLETED',
    s13 === 200 && d13.status === 'COMPLETED',
    s13,
    `status=${d13.status}`,
  );
}

// ── Part 2: Transfer Edge Cases ─────────────────────────────────────────────

async function part2_transferEdgeCases() {
  console.log('\n=== PART 2: Transfer Edge Cases ===\n');

  // 2.1 Lockup blocking — try to create transfer on locked opportunity
  if (investor1LockedHoldingId) {
    const { status: s1, data: d1 } = await api('POST', '/transfers/request', {
      token: tokens.investor1,
      body: {
        holdingId: investor1LockedHoldingId,
        quantity: 10,
      },
    });
    record(
      'PART 2',
      '2.1 Lockup blocks transfer',
      s1 === 400 || s1 === 403 || s1 === 422,
      s1,
      typeof d1.message === 'string' ? d1.message.slice(0, 100) : '',
    );
  } else {
    record(
      'PART 2',
      '2.1 Lockup blocks transfer',
      false,
      0,
      'no locked holding discovered',
    );
  }

  // 2.2 Insufficient units — try to transfer more than held
  if (investor1HoldingId) {
    const { status: s2, data: d2 } = await api('POST', '/transfers/request', {
      token: tokens.investor1,
      body: {
        holdingId: investor1HoldingId,
        quantity: 999999,
      },
    });
    record(
      'PART 2',
      '2.2 Insufficient units rejected',
      s2 === 400 || s2 === 422,
      s2,
      typeof d2.message === 'string' ? d2.message.slice(0, 100) : '',
    );
  } else {
    record(
      'PART 2',
      '2.2 Insufficient units rejected',
      false,
      0,
      'no holding',
    );
  }

  // 2.3 Below minimum transfer quantity
  if (investor1HoldingId) {
    const { status: s3, data: d3 } = await api('POST', '/transfers/request', {
      token: tokens.investor1,
      body: {
        holdingId: investor1HoldingId,
        quantity: 1, // minTransferQuantity is 10
      },
    });
    record(
      'PART 2',
      '2.3 Below min transfer qty rejected',
      s3 === 400 || s3 === 422,
      s3,
      typeof d3.message === 'string' ? d3.message.slice(0, 100) : '',
    );
  } else {
    record(
      'PART 2',
      '2.3 Below min transfer qty rejected',
      false,
      0,
      'no holding',
    );
  }

  // 2.4 Create + cancel
  if (investor1HoldingId) {
    const { status: s4a, data: d4a } = await api(
      'POST',
      '/transfers/request',
      {
        token: tokens.investor1,
        body: {
          holdingId: investor1HoldingId,
          quantity: 20,
          proposedPrice: 20000,
          currency: 'GBP',
        },
      },
    );
    if (s4a === 201 && d4a.id) {
      const cancelId = d4a.id;
      const { status: s4b, data: d4b } = await api(
        'POST',
        `/transfers/${cancelId}/cancel`,
        { token: tokens.investor1 },
      );
      record(
        'PART 2',
        '2.4 Create then cancel transfer',
        s4b === 200 || s4b === 201,
        s4b,
        d4b.status ?? d4b.message ?? '',
      );
    } else {
      record(
        'PART 2',
        '2.4 Create then cancel transfer',
        false,
        s4a,
        `create failed: ${typeof d4a.message === 'string' ? d4a.message.slice(0, 100) : JSON.stringify(d4a).slice(0, 100)}`,
      );
    }
  } else {
    record(
      'PART 2',
      '2.4 Create then cancel transfer',
      false,
      0,
      'no holding',
    );
  }

  // 2.5 Cancel already-cancelled (should fail)
  if (investor1HoldingId) {
    const { status: s5a, data: d5a } = await api(
      'POST',
      '/transfers/request',
      {
        token: tokens.investor1,
        body: {
          holdingId: investor1HoldingId,
          quantity: 15,
        },
      },
    );
    if (s5a === 201 && d5a.id) {
      // First cancel
      await api('POST', `/transfers/${d5a.id}/cancel`, {
        token: tokens.investor1,
      });
      // Second cancel should fail
      const { status: s5c, data: d5c } = await api(
        'POST',
        `/transfers/${d5a.id}/cancel`,
        { token: tokens.investor1 },
      );
      record(
        'PART 2',
        '2.5 Double-cancel rejected',
        s5c === 400 || s5c === 409 || s5c === 422,
        s5c,
        typeof d5c.message === 'string' ? d5c.message.slice(0, 100) : '',
      );
    } else {
      record(
        'PART 2',
        '2.5 Double-cancel rejected',
        false,
        s5a,
        'could not create transfer',
      );
    }
  }

  // 2.6 Investor cannot access admin transfer endpoints
  const { status: s6 } = await api('GET', '/admin/transfers', {
    token: tokens.investor1,
  });
  record(
    'PART 2',
    '2.6 Investor cannot access admin transfers',
    s6 === 403,
    s6,
  );
}

// ── Part 3: Cap Table Viewer ────────────────────────────────────────────────

async function part3_capTable() {
  console.log('\n=== PART 3: Cap Table Viewer ===\n');

  if (!transferEnabledOppId) {
    record('PART 3', 'SKIP — no opportunity ID', false);
    return;
  }

  // 3.1 Admin cap table
  const { status: s1, data: d1 } = await api(
    'GET',
    `/admin/opportunities/${transferEnabledOppId}/cap-table`,
    { token: tokens.admin },
  );
  // Response: { opportunityId, opportunityName, totalUnitsIssued, totalHolders, holdings: [...] }
  const holders1 = d1.holdings ?? [];
  record(
    'PART 3',
    '3.1 Admin cap table returns holders',
    s1 === 200 && Array.isArray(holders1) && holders1.length >= 2,
    s1,
    `holders=${Array.isArray(holders1) ? holders1.length : 0}`,
  );

  // 3.2 Verify cap table has percentage ownership
  if (Array.isArray(holders1) && holders1.length > 0) {
    const hasPercentage = holders1.some(
      (h: any) => h.percentageOwnership !== undefined,
    );
    record('PART 3', '3.2 Cap table includes percentageOwnership', hasPercentage);
  } else {
    record('PART 3', '3.2 Cap table includes percentageOwnership', false);
  }

  // 3.3 Issuer cap table
  if (tokens.issuer) {
    const { status: s3, data: d3 } = await api(
      'GET',
      `/issuer/opportunities/${transferEnabledOppId}/cap-table`,
      { token: tokens.issuer },
    );
    const holders3 = d3.holdings ?? [];
    record(
      'PART 3',
      '3.3 Issuer cap table returns holders',
      s3 === 200 && Array.isArray(holders3) && holders3.length >= 2,
      s3,
      `holders=${Array.isArray(holders3) ? holders3.length : 0}`,
    );
  } else {
    record('PART 3', '3.3 Issuer cap table', false, 0, 'no issuer token');
  }

  // 3.4 Investor cannot access admin cap table
  const { status: s4 } = await api(
    'GET',
    `/admin/opportunities/${transferEnabledOppId}/cap-table`,
    { token: tokens.investor1 },
  );
  record(
    'PART 3',
    '3.4 Investor cannot access admin cap table',
    s4 === 403,
    s4,
  );
}

// ── Part 4: Feature Config ──────────────────────────────────────────────────

async function part4_featureConfig() {
  console.log('\n=== PART 4: Feature Config ===\n');

  if (!transferEnabledOppId) {
    record('PART 4', 'SKIP — no opportunity ID', false);
    return;
  }

  // 4.1 Get feature config
  // Response shape: { opportunityId, featureConfig: { transferRequestEnabled, ... } }
  const { status: s1, data: d1 } = await api(
    'GET',
    `/admin/opportunities/${transferEnabledOppId}/feature-config`,
    { token: tokens.admin },
  );
  const fc1 = d1.featureConfig ?? d1;
  record(
    'PART 4',
    '4.1 Get feature config',
    s1 === 200 && fc1.transferRequestEnabled !== undefined,
    s1,
    `transferRequestEnabled=${fc1.transferRequestEnabled}`,
  );

  // 4.2 Update feature config
  const { status: s2 } = await api(
    'PATCH',
    `/admin/opportunities/${transferEnabledOppId}/feature-config`,
    {
      token: tokens.admin,
      body: {
        surveillanceRequired: true,
      },
    },
  );
  record(
    'PART 4',
    '4.2 Update feature config (surveillanceRequired=true)',
    s2 === 200,
    s2,
  );

  // 4.3 Verify update persisted
  const { status: s3, data: d3 } = await api(
    'GET',
    `/admin/opportunities/${transferEnabledOppId}/feature-config`,
    { token: tokens.admin },
  );
  const fc3 = d3.featureConfig ?? d3;
  record(
    'PART 4',
    '4.3 Verify update persisted',
    s3 === 200 && fc3.surveillanceRequired === true,
    s3,
    `surveillanceRequired=${fc3.surveillanceRequired}`,
  );

  // 4.4 Revert the change
  const { status: s4 } = await api(
    'PATCH',
    `/admin/opportunities/${transferEnabledOppId}/feature-config`,
    {
      token: tokens.admin,
      body: {
        surveillanceRequired: false,
      },
    },
  );
  record('PART 4', '4.4 Revert surveillanceRequired=false', s4 === 200, s4);

  // 4.5 Investor cannot access feature config
  const { status: s5 } = await api(
    'GET',
    `/admin/opportunities/${transferEnabledOppId}/feature-config`,
    { token: tokens.investor1 },
  );
  record(
    'PART 4',
    '4.5 Investor cannot access feature config',
    s5 === 403,
    s5,
  );
}

// ── Part 5: Dormant Market Layer ────────────────────────────────────────────

async function part5_dormantMarket() {
  console.log('\n=== PART 5: Dormant Market Layer ===\n');

  if (!transferEnabledOppId) {
    record('PART 5', 'SKIP — no opportunity ID', false);
    return;
  }

  // secondaryMarketEnabled is false in seed data → should get 403

  // 5.1 POST /market/orders → 403
  const { status: s1, data: d1 } = await api('POST', '/market/orders', {
    token: tokens.investor1,
    body: { opportunityId: transferEnabledOppId },
  });
  record(
    'PART 5',
    '5.1 POST /market/orders → 403 (secondary market disabled)',
    s1 === 403,
    s1,
    typeof d1.message === 'string' ? d1.message.slice(0, 100) : '',
  );

  // 5.2 GET /market/orders → 403
  const { status: s2, data: d2 } = await api('GET', '/market/orders', {
    token: tokens.investor1,
    query: { opportunityId: transferEnabledOppId },
  });
  record(
    'PART 5',
    '5.2 GET /market/orders → 403 (secondary market disabled)',
    s2 === 403,
    s2,
    typeof d2.message === 'string' ? d2.message.slice(0, 100) : '',
  );

  // 5.3 GET /market/orders/:id → 403
  const { status: s3, data: d3 } = await api(
    'GET',
    '/market/orders/00000000-0000-0000-0000-000000000000',
    {
      token: tokens.investor1,
      query: { opportunityId: transferEnabledOppId },
    },
  );
  record(
    'PART 5',
    '5.3 GET /market/orders/:id → 403 (secondary market disabled)',
    s3 === 403,
    s3,
    typeof d3.message === 'string' ? d3.message.slice(0, 100) : '',
  );

  // 5.4 Unauthenticated → 401
  const { status: s4 } = await api('POST', '/market/orders', {
    body: { opportunityId: transferEnabledOppId },
  });
  record(
    'PART 5',
    '5.4 Unauthenticated market request → 401',
    s4 === 401,
    s4,
  );
}

// ── Part 6: Public Market Portal ────────────────────────────────────────────

async function part6_marketStubs() {
  console.log('\n=== PART 6: Public Market Portal ===\n');

  const news = await api('GET', '/public/market/news');
  record(
    'PART 6',
    'GET /public/market/news',
    news.status === 200 && Array.isArray(news.data),
    news.status,
  );

  const screener = await api('GET', '/public/market/asset-screener');
  record(
    'PART 6',
    'GET /public/market/asset-screener',
    screener.status === 200 && Array.isArray(screener.data.data),
    screener.status,
  );

  const assetClasses = await api('GET', '/public/market/asset-classes');
  record(
    'PART 6',
    'GET /public/market/asset-classes',
    assetClasses.status === 200 && assetClasses.data.section === 'asset-classes',
    assetClasses.status,
  );

  const portal = await api('GET', '/public/market/portal');
  record(
    'PART 6',
    'GET /public/market/portal',
    portal.status === 200 && portal.data.parentSection === 'Market Overview',
    portal.status,
  );

  const sectionEndpoints = [
    'market/stablecoins',
    'market/treasuries',
    'market/us-treasuries',
    'market/non-us-government-debt',
    'market/credit',
    'market/private-credit',
    'market/category/credit',
    'market/commodities',
    'market/institutional-funds',
    'market/stocks',
    'market/real-estate',
  ];

  for (const ep of sectionEndpoints) {
    const { status, data } = await api('GET', `/public/${ep}`);
    const ok = status === 200 && data.publicSafe === true && data.section;
    record('PART 6', `GET /public/${ep}`, ok, status);
  }

  const { status: moStatus, data: moData } = await api(
    'GET',
    '/public/market-overview',
  );
  record(
    'PART 6',
    'GET /public/market-overview',
    moStatus === 200 && moData.portal?.parentSection === 'Market Overview',
    moStatus,
  );
}

// ── Part 7: RBAC for New Roles ──────────────────────────────────────────────

async function part7_rbac() {
  console.log('\n=== PART 7: RBAC for New Roles ===\n');

  // 7.1 SPV_MANAGER cannot access admin endpoints
  if (tokens.spvManager) {
    const { status: s1 } = await api('GET', '/admin/transfers', {
      token: tokens.spvManager,
    });
    record(
      'PART 7',
      '7.1 SPV_MANAGER cannot access admin transfers',
      s1 === 403,
      s1,
    );
  } else {
    record(
      'PART 7',
      '7.1 SPV_MANAGER cannot access admin transfers',
      false,
      0,
      'no spvManager token — user may not be seeded',
    );
  }

  // 7.2 COMPLIANCE_OFFICER cannot access admin endpoints
  if (tokens.compliance) {
    const { status: s2 } = await api('GET', '/admin/transfers', {
      token: tokens.compliance,
    });
    record(
      'PART 7',
      '7.2 COMPLIANCE_OFFICER cannot access admin transfers',
      s2 === 403,
      s2,
    );
  } else {
    record(
      'PART 7',
      '7.2 COMPLIANCE_OFFICER cannot access admin transfers',
      false,
      0,
      'no compliance token — user may not be seeded',
    );
  }

  // 7.3 SPV_MANAGER cannot access issuer endpoints
  if (tokens.spvManager) {
    const { status: s3 } = await api('GET', '/issuer/transfers', {
      token: tokens.spvManager,
    });
    record(
      'PART 7',
      '7.3 SPV_MANAGER cannot access issuer transfers',
      s3 === 403,
      s3,
    );
  } else {
    record(
      'PART 7',
      '7.3 SPV_MANAGER cannot access issuer transfers',
      false,
      0,
      'no spvManager token',
    );
  }

  // 7.4 COMPLIANCE_OFFICER cannot access issuer endpoints
  if (tokens.compliance) {
    const { status: s4 } = await api('GET', '/issuer/transfers', {
      token: tokens.compliance,
    });
    record(
      'PART 7',
      '7.4 COMPLIANCE_OFFICER cannot access issuer transfers',
      s4 === 403,
      s4,
    );
  } else {
    record(
      'PART 7',
      '7.4 COMPLIANCE_OFFICER cannot access issuer transfers',
      false,
      0,
      'no compliance token',
    );
  }

  // 7.5 SPV_MANAGER cannot create transfer requests (role is not VERIFIED)
  if (tokens.spvManager && investor1HoldingId) {
    const { status: s5 } = await api('POST', '/transfers/request', {
      token: tokens.spvManager,
      body: { holdingId: investor1HoldingId, quantity: 10 },
    });
    record(
      'PART 7',
      '7.5 SPV_MANAGER cannot create transfer request',
      s5 === 403,
      s5,
    );
  } else {
    record(
      'PART 7',
      '7.5 SPV_MANAGER cannot create transfer request',
      false,
      0,
      !tokens.spvManager ? 'no spvManager token' : 'no holding',
    );
  }

  // 7.6 COMPLIANCE_OFFICER cannot create transfer requests
  if (tokens.compliance && investor1HoldingId) {
    const { status: s6 } = await api('POST', '/transfers/request', {
      token: tokens.compliance,
      body: { holdingId: investor1HoldingId, quantity: 10 },
    });
    record(
      'PART 7',
      '7.6 COMPLIANCE_OFFICER cannot create transfer request',
      s6 === 403,
      s6,
    );
  } else {
    record(
      'PART 7',
      '7.6 COMPLIANCE_OFFICER cannot create transfer request',
      false,
      0,
      !tokens.compliance ? 'no compliance token' : 'no holding',
    );
  }

  // 7.7 VERIFIED investor cannot access tenant-admin user management
  const { status: s7 } = await api('GET', '/admin/users', {
    token: tokens.investor1,
  });
  record(
    'PART 7',
    '7.7 Investor cannot access admin user list',
    s7 === 403,
    s7,
  );

  // 7.8 ISSUER can access issuer endpoints
  if (tokens.issuer) {
    const { status: s8 } = await api('GET', '/issuer/dashboard', {
      token: tokens.issuer,
    });
    record(
      'PART 7',
      '7.8 ISSUER can access issuer dashboard',
      s8 === 200,
      s8,
    );
  } else {
    record('PART 7', '7.8 ISSUER can access issuer dashboard', false, 0);
  }

  // 7.9 ADMIN can access admin endpoints
  const { status: s9 } = await api('GET', '/admin/opportunities', {
    token: tokens.admin,
    query: { status: 'LIVE' },
  });
  record('PART 7', '7.9 ADMIN can access admin opportunities', s9 === 200, s9);
}

// ── Summary ─────────────────────────────────────────────────────────────────

function printSummary() {
  console.log('\n');
  console.log('═'.repeat(72));
  console.log('  E2E TEST SUMMARY');
  console.log('═'.repeat(72));

  const parts = [...new Set(results.map((r) => r.part))];

  let totalPass = 0;
  let totalFail = 0;

  for (const part of parts) {
    const partResults = results.filter((r) => r.part === part);
    const passed = partResults.filter((r) => r.passed).length;
    const failed = partResults.filter((r) => !r.passed).length;
    totalPass += passed;
    totalFail += failed;

    const pct =
      partResults.length > 0
        ? Math.round((passed / partResults.length) * 100)
        : 0;
    const color = failed === 0 ? '\x1b[32m' : '\x1b[31m';
    console.log(
      `  ${color}${part}\x1b[0m: ${passed}/${partResults.length} passed (${pct}%)`,
    );

    // Show failures
    for (const r of partResults.filter((r) => !r.passed)) {
      console.log(
        `    \x1b[31m✗\x1b[0m ${r.name}${r.status ? ` [HTTP ${r.status}]` : ''}${r.detail ? ` — ${r.detail}` : ''}`,
      );
    }
  }

  console.log('─'.repeat(72));
  const overallColor = totalFail === 0 ? '\x1b[32m' : '\x1b[31m';
  console.log(
    `  ${overallColor}TOTAL: ${totalPass}/${totalPass + totalFail} passed, ${totalFail} failed\x1b[0m`,
  );
  console.log('═'.repeat(72));
  console.log('');

  process.exit(totalFail > 0 ? 1 : 0);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nOpenReal E2E Tests — ${BASE_URL}\n`);

  await setup();
  await part1_transferHappyPath();
  await part2_transferEdgeCases();
  await part3_capTable();
  await part4_featureConfig();
  await part5_dormantMarket();
  await part6_marketStubs();
  await part7_rbac();

  printSummary();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
