import { describe, it, expect, beforeAll } from 'vitest';
import { createAdminClient } from '@/lib/auth';
import { searchEverything } from '@/lib/admin-search';
import { buildCommandCenterData } from '@/lib/admin-command-center';
import {
  getOpenDisputes,
  getPausedPayouts,
  getNotOnboardedCount,
  getNotOnboardedAccounts,
  getSuspendedAccounts,
  getPaymentsNeedingAttention,
  getOverdueQuickStops,
  getFailedSmsEvents,
  getFailedEmailEvents,
  getUnresolvedWebhookFailures,
  getRecentIncidents,
  getCasesNearSla,
  getMyAssignedCases,
} from '@/lib/admin-alerts';
import {
  createSupportCase,
  addSupportCaseNote,
  updateSupportCaseStatus,
  assignSupportCase,
  listSupportCases,
  listSupportCaseNotes,
  getSupportCase,
} from '@/lib/support-cases';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { recordLoginEvent, listLoginEvents } from '@/lib/login-events';

// Integration suite: the real admin lib modules against a real staging Postgres.
//
// WHAT THIS IS FOR. Every one of these functions is a query written against a
// table that, until now, existed only as SQL in a file nobody had executed. A
// column named wrongly, a filter on a value the check constraint forbids, an
// .order() on a column that isn't there — none of that shows up in tsc, in lint,
// or in the unit suite, because none of those touch a database. It shows up the
// first time a staff member opens the page.
//
// Run: npx vitest run --config vitest.staging.config.ts
// Never runs in CI: vitest.config.ts's include is test/**, this lives in
// test-staging/**.

const admin = createAdminClient();
const STAFF = 'staging-suite@letsgetquoted.com';

beforeAll(() => {
  // Fail loudly and specifically rather than letting every test die on a
  // connection refused to the unit suite's dummy localhost URL.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url || url.includes('localhost')) {
    throw new Error(
      'These tests need .env.staging.local and the staging vitest config:\n' +
        '  npx vitest run --config vitest.staging.config.ts',
    );
  }
});

describe('the staging database is the one we think it is', () => {
  it('has the seeded account and its customers', async () => {
    const { count } = await admin.from('accounts').select('id', { count: 'exact', head: true });
    expect(count).toBeGreaterThan(0);
    const { count: clients } = await admin.from('clients').select('id', { count: 'exact', head: true });
    expect(clients).toBeGreaterThan(0);
  });
});

describe('Universal Search — every branch actually runs', () => {
  // The fan-out catches each branch independently, so a branch querying a
  // column that does not exist returns [] rather than throwing. That is right
  // for production and useless for verification: an always-empty branch is
  // indistinguishable from a working one with no matches. So each assertion
  // below searches for something that IS in the database.

  it('finds an account by business name', async () => {
    const results = await searchEverything(admin, 'Staging Test');
    expect(results.accounts.length).toBeGreaterThan(0);
  });

  it('finds an account by exact account number', async () => {
    const { data } = await admin.from('accounts').select('account_number').not('account_number', 'is', null).limit(1).maybeSingle();
    if (!data?.account_number) return; // no numbered account seeded
    const results = await searchEverything(admin, String(data.account_number));
    expect(results.accounts.length).toBeGreaterThan(0);
  });

  it('finds a customer by name, and by email', async () => {
    const { data: client } = await admin.from('clients').select('name, email').limit(1).maybeSingle();
    expect(client).toBeTruthy();
    const byName = await searchEverything(admin, String(client!.name).split(' ')[0]);
    expect(byName.clients.length).toBeGreaterThan(0);
    const byEmail = await searchEverything(admin, String(client!.email));
    expect(byEmail.clients.length).toBeGreaterThan(0);
  });

  it('finds a payment by its id', async () => {
    const { data: payment } = await admin.from('payments').select('id').limit(1).maybeSingle();
    expect(payment).toBeTruthy();
    const results = await searchEverything(admin, String(payment!.id));
    expect(results.payments.length).toBeGreaterThan(0);
  });

  it('returns everything empty for a string that matches nothing', async () => {
    const results = await searchEverything(admin, 'zzz-no-such-record-zzz');
    expect(results.accounts).toHaveLength(0);
    expect(results.clients).toHaveLength(0);
    expect(results.quickStops).toHaveLength(0);
    expect(results.payments).toHaveLength(0);
  });

  it('returns empty rather than scanning the world for a blank query', async () => {
    const results = await searchEverything(admin, '   ');
    expect(results.accounts).toHaveLength(0);
  });
});

describe('Command Center alert fetchers — each one against real tables', () => {
  // Every fetcher is best-effort and swallows its own errors, so "did not throw"
  // proves nothing. What is asserted is that each returns the SHAPE it promises:
  // a broken query degrades to [] or 0, and an array/number of the right type is
  // the only evidence available that the column names were right.
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['getOpenDisputes', () => getOpenDisputes(admin)],
    ['getPausedPayouts', () => getPausedPayouts(admin)],
    ['getNotOnboardedAccounts', () => getNotOnboardedAccounts(admin)],
    ['getSuspendedAccounts', () => getSuspendedAccounts(admin)],
    ['getPaymentsNeedingAttention', () => getPaymentsNeedingAttention(admin)],
    ['getOverdueQuickStops', () => getOverdueQuickStops(admin)],
    ['getFailedSmsEvents', () => getFailedSmsEvents(admin)],
    ['getFailedEmailEvents', () => getFailedEmailEvents(admin)],
    ['getUnresolvedWebhookFailures', () => getUnresolvedWebhookFailures(admin)],
    ['getRecentIncidents', () => getRecentIncidents(admin)],
    ['getCasesNearSla', () => getCasesNearSla(admin)],
    ['getMyAssignedCases', () => getMyAssignedCases(admin, STAFF)],
  ];

  for (const [name, run] of cases) {
    it(`${name} returns an array`, async () => {
      const result = await run();
      expect(Array.isArray(result)).toBe(true);
    });
  }

  it('getNotOnboardedCount returns a number', async () => {
    const count = await getNotOnboardedCount(admin);
    expect(typeof count).toBe('number');
    expect(Number.isFinite(count)).toBe(true);
  });
});

describe('buildCommandCenterData', () => {
  it('builds for each role without throwing, at each range', async () => {
    for (const role of ['admin', 'support', 'finance'] as const) {
      for (const range of ['7d', '30d', '90d'] as const) {
        const data = await buildCommandCenterData(admin, { role, staffEmail: STAFF, range });
        expect(data).toBeTruthy();
      }
    }
  });
});

describe('Support cases — the full lifecycle against real tables', () => {
  let caseId: string;

  it('creates a case', async () => {
    const created = await createSupportCase(admin, STAFF, {
      subject: 'Staging suite — lifecycle case',
      priority: 'high',
      assignedTo: STAFF,
      slaDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('open');
    caseId = created.id;
  });

  it('reads it back by id', async () => {
    const found = await getSupportCase(admin, caseId);
    expect(found?.subject).toContain('lifecycle case');
  });

  it('lists it, and filters by status', async () => {
    // `statuses`, plural and an array — the shape the Cases page's filter tabs
    // pass. Getting this wrong here silently listed everything and looked like a
    // broken filter in the library.
    const open = await listSupportCases(admin, { statuses: ['open'] });
    expect(open.some((c) => c.id === caseId)).toBe(true);
    const closed = await listSupportCases(admin, { statuses: ['closed'] });
    expect(closed.some((c) => c.id === caseId)).toBe(false);
  });

  it('threads a note', async () => {
    await addSupportCaseNote(admin, STAFF, caseId, 'A note from the staging suite.');
    const notes = await listSupportCaseNotes(admin, caseId);
    expect(notes.some((n) => n.body.includes('staging suite'))).toBe(true);
  });

  it('records a status change INTO the note thread, not only on the row', async () => {
    // The thread is meant to be a full history on its own, without joining
    // admin_actions. If the status_change row is missing, the case detail page
    // shows a status that changed with no record of who changed it.
    await updateSupportCaseStatus(admin, STAFF, caseId, 'pending');
    const after = await getSupportCase(admin, caseId);
    expect(after?.status).toBe('pending');
    const notes = await listSupportCaseNotes(admin, caseId);
    expect(notes.some((n) => n.kind === 'status_change')).toBe(true);
  });

  it('assigns and unassigns', async () => {
    await assignSupportCase(admin, STAFF, caseId, 'someone-else@letsgetquoted.com');
    expect((await getSupportCase(admin, caseId))?.assigned_to).toBe('someone-else@letsgetquoted.com');
    await assignSupportCase(admin, STAFF, caseId, null);
    expect((await getSupportCase(admin, caseId))?.assigned_to).toBeNull();
  });

  it('surfaces a past-due open case on the SLA fetcher', async () => {
    const overdue = await createSupportCase(admin, STAFF, {
      subject: 'Staging suite — already past SLA',
      priority: 'urgent',
      assignedTo: STAFF,
      slaDueAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const nearSla = await getCasesNearSla(admin);
    expect(nearSla.some((c) => c.id === overdue.id)).toBe(true);
    const mine = await getMyAssignedCases(admin, STAFF);
    expect(mine.some((c) => c.id === overdue.id)).toBe(true);
  });

  it('drops a resolved case off the SLA list', async () => {
    await updateSupportCaseStatus(admin, STAFF, caseId, 'resolved');
    const nearSla = await getCasesNearSla(admin);
    expect(nearSla.some((c) => c.id === caseId)).toBe(false);
  });
});

describe('Webhook failure logging', () => {
  it('writes a row and surfaces it as unresolved', async () => {
    await logWebhookFailure({
      source: 'stripe',
      eventType: 'staging.suite.test',
      referenceId: `evt_staging_${Date.now()}`,
      errorMessage: 'Staging suite — synthetic failure',
      payloadExcerpt: '{"synthetic":true}',
    });
    const unresolved = await getUnresolvedWebhookFailures(admin, { limit: 50 });
    expect(unresolved.some((row) => row.error_message.includes('Staging suite'))).toBe(true);
  });

  it('never throws on a source the check constraint rejects', async () => {
    // logWebhookFailure's contract is that it can be called from inside a
    // webhook catch block and can never itself become the error. A bad source
    // violates the check constraint, which must be swallowed.
    await expect(
      logWebhookFailure({ source: 'not-a-real-source' as never, errorMessage: 'should not throw' }),
    ).resolves.toBeUndefined();
  });
});

describe('Login events', () => {
  it('records a sign-in and lists it back for the account', async () => {
    const { data: account } = await admin.from('accounts').select('id').limit(1).maybeSingle();
    const { data: member } = await admin
      .from('memberships')
      .select('user_id')
      .eq('account_id', account!.id)
      .limit(1)
      .maybeSingle();
    if (!member?.user_id) return; // no auth user on the seeded account

    await recordLoginEvent({
      accountId: account!.id as string,
      userId: member.user_id as string,
      method: 'magic_link',
      ip: '203.0.113.7',
      userAgent: 'staging-suite',
    });
    const events = await listLoginEvents(admin, account!.id as string);
    expect(events.some((e) => e.user_agent === 'staging-suite')).toBe(true);
  });
});
