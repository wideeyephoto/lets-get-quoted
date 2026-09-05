import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MIGRATION = read('migrations', '20260905140000_review_invites_rls_hardening.sql');
const REVIEWS_LIB = stripJs(read('src', 'lib', 'reviews.ts'));
const SMS_LIB = stripJs(read('src', 'lib', 'sms.ts'));
const BIZ_NAME_LIB = stripJs(read('src', 'lib', 'business-name.ts'));
const JOBS_ACTIONS = stripJs(read('src', 'app', 'dashboard', 'jobs', 'actions.ts'));
const REVIEWS_PAGE = stripJs(read('src', 'app', 'dashboard', 'reviews', 'page.tsx'));
const REVIEWS_SCREEN = stripJs(read('src', 'app', 'dashboard', 'reviews', 'ReviewsScreen.tsx'));
const REVIEW_DRAWER = stripJs(read('src', 'app', 'dashboard', 'reviews', 'ReviewDrawer.tsx'));

describe('Reviews RLS and Security Hardening Migration', () => {
  it('exists as an applied migration file', () => {
    expect(existsSync(join(process.cwd(), 'migrations', '20260905140000_review_invites_rls_hardening.sql'))).toBe(true);
  });

  it('corrects review_invites_modify to have symmetric USING and WITH CHECK policies', () => {
    expect(MIGRATION).toMatch(/drop\s+policy\s+if\s+exists\s+review_invites_modify\s+on\s+public\.review_invites;/i);
    expect(MIGRATION).toMatch(/create\s+policy\s+review_invites_modify\s+on\s+public\.review_invites/i);

    // USING clause checks jobs.write OR clients.write
    expect(MIGRATION).toMatch(/using\s*\(\s*public\.office_can\(account_id,\s*'jobs\.write'\)\s+or\s+public\.office_can\(account_id,\s*'clients\.write'\)\s*\)/i);

    // WITH CHECK clause must also check jobs.write OR clients.write (not AND)
    expect(MIGRATION).toMatch(/with\s+check\s*\(\s*public\.office_can\(account_id,\s*'jobs\.write'\)\s+or\s+public\.office_can\(account_id,\s*'clients\.write'\)\s*\)/i);
  });

  it('revokes anon access to review_invites', () => {
    expect(MIGRATION).toMatch(/revoke\s+insert,\s*update,\s*delete\s+on\s+table\s+public\.review_invites\s+from\s+anon;/i);
  });
});

describe('Reminder Counter and SMS Idempotency', () => {
  it('checks the review_invites update result and surfaces errors when counter fails to increment', () => {
    const fnStart = REVIEWS_LIB.indexOf('export async function sendReviewReminder');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = REVIEWS_LIB.indexOf('\nexport ', fnStart + 1);
    const fnCode = REVIEWS_LIB.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);

    // Verifies .select('id, reminders_sent').maybeSingle()
    expect(fnCode).toContain('.select(\'id, reminders_sent\')');
    expect(fnCode).toContain('.maybeSingle()');

    // Verifies error / null check
    expect(fnCode).toMatch(/if\s*\(\s*(?:updateError\s*\|\|\s*!updated|!updated\s*\|\|\s*updateError)/);
    expect(fnCode).toContain('ok: false');
  });

  it('verifies SMS idempotency does not silently mask duplicate / uncreated deliveries', () => {
    const fnStart = SMS_LIB.indexOf('export async function sendReviewRequestSms');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = SMS_LIB.indexOf('\nexport ', fnStart + 1);
    const fnCode = SMS_LIB.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);

    expect(fnCode).toContain('enqueueSmsDelivery');
    expect(fnCode).toMatch(/if\s*\(\s*params\.idempotencyKey\s*&&\s*!queued\.created\s*\)/);
  });
});

describe('Query Optimization: Single Row Lookup and Limit', () => {
  it('limits loadReviewActivity query size to prevent unbounded memory growth', () => {
    const fnStart = REVIEWS_LIB.indexOf('export async function loadReviewActivity');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = REVIEWS_LIB.indexOf('\nexport ', fnStart + 1);
    const fnCode = REVIEWS_LIB.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);

    expect(fnCode).toContain('limit = 1000');
    expect(fnCode).toContain('.limit(limit)');
  });

  it('getReviewActivityRow performs a targeted single-row lookup instead of fetching all activity', () => {
    const fnStart = REVIEWS_LIB.indexOf('export async function getReviewActivityRow');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = REVIEWS_LIB.indexOf('\nexport ', fnStart + 1);
    const fnCode = REVIEWS_LIB.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);

    // Must NOT call loadReviewActivity
    expect(fnCode).not.toContain('loadReviewActivity(');

    // Queries review_invites specifically by id
    expect(fnCode).toContain(".from('review_invites')");
    expect(fnCode).toContain(".eq('id', id)");
    expect(fnCode).toContain(".eq('account_id', accountId)");
  });
});

describe('Office Staff Access & Admin Fallbacks', () => {
  it('reviews page loads account and site data with admin client to prevent RLS hiding settings from office staff', () => {
    expect(REVIEWS_PAGE).toContain("const admin = createAdminClient()");
    expect(REVIEWS_PAGE).toContain("accountTimeZone");
    expect(REVIEWS_PAGE).toContain("admin.from('accounts')");
    expect(REVIEWS_PAGE).toContain("admin.from('sites')");
    expect(REVIEWS_PAGE).toContain("timeZone={accountTimeZone}");
  });

  it('business name helper falls back to admin client when session client is blocked by RLS', () => {
    expect(BIZ_NAME_LIB).toContain('createAdminClient');
    expect(BIZ_NAME_LIB).toMatch(/admin\.from\('sites'\)/);
    expect(BIZ_NAME_LIB).toMatch(/admin\.from\('accounts'\)/);
  });

  it('job completion and review request actions query sites, accounts, and job_feed with admin client', () => {
    expect(JOBS_ACTIONS).toContain("resolveAccountReviewUrl");
    expect(JOBS_ACTIONS).toContain("deliverJobReviewRequest");

    const resolveStart = JOBS_ACTIONS.indexOf('async function resolveAccountReviewUrl');
    expect(resolveStart).toBeGreaterThan(-1);
    const resolveEnd = JOBS_ACTIONS.indexOf('\nasync function ', resolveStart + 1);
    const resolveCode = JOBS_ACTIONS.slice(resolveStart, resolveEnd === -1 ? undefined : resolveEnd);
    expect(resolveCode).toMatch(/admin\s*\.from\('sites'\)/);

    const deliverStart = JOBS_ACTIONS.indexOf('async function deliverJobReviewRequest');
    expect(deliverStart).toBeGreaterThan(-1);
    const deliverEnd = JOBS_ACTIONS.indexOf('\nasync function ', deliverStart + 1);
    const deliverCode = JOBS_ACTIONS.slice(deliverStart, deliverEnd === -1 ? undefined : deliverEnd);

    expect(deliverCode).toMatch(/admin\s*\.from\('accounts'\)/);
    expect(deliverCode).toContain("createJobFeedEvent(admin");
  });
});

describe('Timezone Consistency Across Screens', () => {
  it('ReviewsScreen accepts timeZone and passes it to all formatDate calls and ReviewDrawer', () => {
    expect(REVIEWS_SCREEN).toContain('timeZone = \'America/New_York\'');
    expect(REVIEWS_SCREEN).toContain('formatDate(row.sentAt, timeZone)');
    expect(REVIEWS_SCREEN).toContain('formatDate(row.respondedAt, timeZone)');
    expect(REVIEWS_SCREEN).toContain('formatDate(row.feedbackAt ?? row.respondedAt, timeZone)');
    expect(REVIEWS_SCREEN).toContain('<ReviewDrawer row={openRow} basePath={basePath} nowIso={nowIso} readOnly={readOnly} timeZone={timeZone} />');
  });

  it('ReviewDrawer accepts timeZone and formats timeline and resolve dates in account timeZone', () => {
    expect(REVIEW_DRAWER).toContain("timeZone = 'America/New_York'");
    expect(REVIEW_DRAWER).toContain("fmt(event.when, timeZone)");
    expect(REVIEW_DRAWER).toContain("fmt(row.resolvedAt, timeZone)");
  });

  it('formats dates consistently in specified timezones', () => {
    const iso = '2026-09-05T01:30:00.000Z';
    // In UTC, this is Sep 5. In America/New_York (-4 in EDT), it is Sep 4 at 9:30 PM.
    const nyDate = new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    });
    expect(nyDate).toBe('Sep 4, 2026');

    const utcDate = new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    expect(utcDate).toBe('Sep 5, 2026');
  });
});
