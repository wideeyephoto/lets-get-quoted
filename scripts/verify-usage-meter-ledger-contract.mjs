/**
 * Prove the four usage meters actually talk to the real credit ledger.
 *
 * WHY THIS EXISTS, AND WHY IT MATTERS MORE THAN IT SOUNDS. Every test of
 * text-credit-usage, marketing-email-usage and ai-writing-usage mocks `rpc`.
 * They assert that the right RPC name is called with the right arguments — they
 * cannot assert that the real function ACCEPTS those arguments.
 *
 * That gap is dangerous specifically because of how those meters are designed.
 * They treat any unrecognised failure as `ledger_unavailable` and ADMIT the
 * request unbilled, deliberately, so a database hiccup never stops a
 * contractor's appointment reminder. The same property means a wrong parameter
 * shape produces no error anyone sees: every send is admitted, nothing is ever
 * billed, and the meter looks like it is working.
 *
 * `reserve_usage_credits` validates `p_resource_code` and `p_operation_type`
 * against `^[a-z][a-z0-9_]{1,63}$`, bounds `p_expires_at` to the next 24 hours,
 * requires a non-empty idempotency key and a JSON object for metadata, and
 * raises P0001 for a genuine shortfall. Each of those is a way to fail open.
 *
 * The single most important assertion here is the LAST one: that a real
 * shortfall raises code P0001 with a message matching the regex the meters use
 * to recognise it. If that ever drifts, enforcement silently stops refusing —
 * the meters would admit an exhausted workspace for ever and report success.
 *
 * The ledger DDL is lifted verbatim out of 20260815213142 rather than retyped;
 * the rest of that migration reaches half the schema, so only the four tables
 * and five functions the meters touch are installed.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
]) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. To run this check:\n\n'
    + '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n',
  );
  process.exit(2);
}

const LEDGER = readFileSync(
  join(REPO, 'migrations', '20260815213142_pricing_entitlements.sql'), 'utf8',
).replace(/\r\n/g, '\n');

/** Lift one `create table ... ( ... );` block verbatim. */
function liftTable(name) {
  const start = LEDGER.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`table ${name} not found`);
  const end = LEDGER.indexOf('\n);', start);
  if (end < 0) throw new Error(`table ${name} unterminated`);
  return LEDGER.slice(start, end + 3);
}

/** Lift one dollar-quoted function verbatim. */
function liftFunction(name) {
  const start = LEDGER.search(new RegExp(`create or replace function public\\.${name}\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  const tag = LEDGER.slice(start).match(/\nas (\$\$)\n/);
  if (!tag) throw new Error(`function ${name} has no $$ body`);
  const close = LEDGER.indexOf('\n$$;', start + tag.index + tag[0].length);
  if (close < 0) throw new Error(`function ${name} unterminated`);
  return LEDGER.slice(start, close + 4);
}

// The exact parameter shapes the meters send. Kept as data so a drift between
// this file and a meter is visible rather than buried in a call.
const METERS = [
  { meter: 'text-credit-usage', resource: 'text_segments', operation: 'text_send', units: 3, schema: 'text-credit.v1' },
  { meter: 'marketing-email-usage', resource: 'marketing_email_sends', operation: 'marketing_email_send', units: 1, schema: 'marketing-email.v1' },
  { meter: 'ai-writing-usage', resource: 'ai_writing_drafts', operation: 'ai_writing_draft', units: 1, schema: 'ai-writing.v1' },
  { meter: 'ai-intake-usage', resource: 'ai_intake_threads', operation: 'ai_intake_thread', units: 1, schema: 'ai-intake.v1' },
];

/** The regex every meter uses to recognise a genuine shortfall. */
const INSUFFICIENT = /insufficient usage credits/i;

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-ledger-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_LEDGER_CHECK_PORT || 54339),
  persistent: false, onLog: () => {}, onError: () => {},
});

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_ledger');
  c = pg.getPgClient('lgq_ledger');
  await c.connect();

  // Only the tables the ledger has foreign keys into. Nothing here is exercised;
  // they exist so the real DDL can be installed unmodified.
  await c.query(`
    create table public.accounts (id uuid primary key);
    create table public.billing_events (id uuid primary key, account_id uuid);
  `);
  for (const t of ['workspace_entitlements', 'usage_credit_lots', 'usage_reservations', 'usage_reservation_allocations']) {
    await c.query(liftTable(t));
  }
  for (const f of [
    'grant_usage_credits', 'reserve_usage_credits',
    'commit_usage_reservation', 'release_usage_reservation', 'expire_usage_reservations',
  ]) {
    await c.query(liftFunction(f));
  }
  await c.query('insert into public.accounts (id) values ($1)', [ACCOUNT]);
  ck('the real ledger installs on a real engine', true);

  const available = async (resource) => Number((await c.query(
    `select coalesce(sum(granted_units - consumed_units - reserved_units - revoked_units), 0) as n
       from public.usage_credit_lots where account_id = $1 and resource_code = $2`,
    [ACCOUNT, resource],
  )).rows[0].n);

  for (const spec of METERS) {
    const label = `${spec.meter} (${spec.resource})`;

    await c.query(
      `select public.grant_usage_credits($1, $2, 'plan_period', $3, null, null, $4, null, null)`,
      [ACCOUNT, spec.resource, `seed:${spec.resource}`, 100],
    ).catch(async () => {
      // Signature differs across versions; fall back to named defaults.
      await c.query(
        `select public.grant_usage_credits(
           p_account_id => $1, p_resource_code => $2, p_source_type => 'plan_period',
           p_idempotency_key => $3, p_units => $4)`,
        [ACCOUNT, spec.resource, `seed:${spec.resource}`, 100],
      );
    });
    ck(`${label}: the resource code is one the ledger accepts`, await available(spec.resource) === 100);

    // The exact call each meter makes.
    const reserve = (key, units = spec.units) => c.query(
      `select public.reserve_usage_credits(
         p_account_id => $1, p_resource_code => $2, p_units => $3,
         p_idempotency_key => $4, p_operation_type => $5,
         p_expires_at => $6, p_metadata => $7::jsonb) as id`,
      [ACCOUNT, spec.resource, units, key, spec.operation,
        new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        JSON.stringify({ schema: spec.schema, claim_nonce: '00000000-0000-4000-8000-000000000000' })],
    );

    const held = await reserve(`${spec.resource}:hold`);
    const reservationId = held.rows[0].id;
    ck(`${label}: the operation type passes validation`, typeof reservationId === 'string' && reservationId.length > 0);
    ck(`${label}: the 15-minute TTL is inside the ledger's 24-hour bound`, true);
    ck(`${label}: reserving lowers the balance`, await available(spec.resource) === 100 - spec.units);

    // The finalization key is a REPLAY guard, not an authorization check: the
    // ledger stores it on the first commit and only refuses a LATER commit that
    // presents a different one. Asserting the other way round was my own
    // misreading, and worth writing down because the meters mint a fresh
    // idempotency key per send, so this path never engages in production.
    const ok2 = await c.query('select public.commit_usage_reservation($1, $2) as ok',
      [reservationId, `${spec.resource}:hold:commit`]);
    ck(`${label}: committing with the meter's own key shape works`, ok2.rows[0].ok === true);

    let replay = null;
    try {
      await c.query('select public.commit_usage_reservation($1, $2) as ok',
        [reservationId, 'a-different-key']);
    } catch (err) { replay = err; }
    ck(`${label}: a second commit under a different key is refused`, replay?.code === '22000', replay?.code);

    const held3 = await reserve(`${spec.resource}:hold3`);
    const rel = await c.query('select public.release_usage_reservation($1, $2, $3) as ok',
      [held3.rows[0].id, `${spec.resource}:hold3:commit`, 'send_failed']);
    ck(`${label}: releasing gives the credits back`, rel.rows[0].ok === true);
  }

  // THE ONE THAT MATTERS MOST.
  let shortfall = null;
  try {
    await c.query(
      `select public.reserve_usage_credits(
         p_account_id => $1, p_resource_code => 'text_segments', p_units => $2,
         p_idempotency_key => 'drain', p_operation_type => 'text_send',
         p_expires_at => $3, p_metadata => '{}'::jsonb)`,
      [ACCOUNT, 10_000, new Date(Date.now() + 60_000).toISOString()],
    );
  } catch (err) {
    shortfall = err;
  }
  ck('a genuine shortfall raises rather than returning null', shortfall !== null);
  ck('...with the SQLSTATE the meters test for (P0001)', shortfall?.code === 'P0001', shortfall?.code);
  ck('...and a message the meters’ regex recognises',
    INSUFFICIENT.test(shortfall?.message ?? ''), shortfall?.message?.slice(0, 90));

  // A shortfall the meters must NOT mistake for one.
  let bogus = null;
  try {
    await c.query(
      `select public.reserve_usage_credits(
         p_account_id => $1, p_resource_code => 'text_segments', p_units => 1,
         p_idempotency_key => 'bad-op', p_operation_type => 'Text Send',
         p_expires_at => $2, p_metadata => '{}'::jsonb)`,
      [ACCOUNT, new Date(Date.now() + 60_000).toISOString()],
    );
  } catch (err) { bogus = err; }
  ck('an invalid operation type is 22023, not P0001, so it reads as unavailable rather than exhausted',
    bogus?.code === '22023' && !INSUFFICIENT.test(bogus?.message ?? ''), bogus?.code);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 300));
} finally {
  try { await c?.end(); } catch { /* going away */ }
  try { await pg.stop(); } catch { /* going away */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp */ }
}

let failed = 0;
for (const r of R) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${!r.ok && r.d ? `  [${r.d}]` : ''}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
