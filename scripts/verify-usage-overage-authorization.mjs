/**
 * Run 20260819080000_usage_overage_authorization.sql against a real PostgreSQL 17.
 *
 * This one decides whether a contractor gets charged money they did not plan to
 * spend, so the assertions are about the promise rather than the plumbing: LGQ
 * never charges an automatic overage without affirmative approval AND a cap.
 *
 * The two that matter most:
 *
 *  - A workspace with no settings row, or a disabled one, accrues nothing. The
 *    default has to be refusal, not "unlimited until configured".
 *  - Two concurrent charges that each fit under the cap but together exceed it
 *    cannot both be admitted. That is the whole reason the check and the write
 *    are one statement under one lock, and it is not observable from unit tests.
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

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = '20260819080000_usage_overage_authorization.sql';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);
const P0 = '2026-08-01T00:00:00Z';
const P1 = '2026-09-01T00:00:00Z';

// Rates as derived from the top-up catalog, in millicents per unit.
const TEXT = 4800; // 4.8c a segment
const EMAIL = 340; // 0.34c a send -- the reason accruals are not in whole cents

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-overage-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_OVERAGE_CHECK_PORT || 54340),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
let c2;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_overage');
  c = pg.getPgClient('lgq_overage');
  await c.connect();
  await c.query(`
    create table public.accounts (id uuid primary key);
    create or replace function public.is_owner(a uuid) returns boolean language sql as $$ select true $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
  `);
  await c.query('insert into public.accounts (id) values ($1), ($2)', [ACCOUNT, OTHER]);

  await c.query(m(MIGRATION));
  ck('migration applies on a real engine', true);
  await c.query(m(MIGRATION));
  ck('migration re-applies as a no-op', true);

  const decide = async (account, resource, units, rate, client = c) => (await client.query(
    'select * from public.authorize_usage_overage($1, $2, $3, $4, $5, $6)',
    [account, resource, units, rate, P0, P1],
  )).rows[0];

  // --- The default, which is the promise ---
  let d = await decide(ACCOUNT, 'text_segments', 10, TEXT);
  ck('a workspace that never opted in accrues nothing', d.decision === 'not_authorized', d.decision);
  ck('and nothing was written', Number((await c.query(
    'select count(*)::int as n from public.workspace_overage_accruals')).rows[0].n) === 0);

  // --- Enabling requires evidence, and a cap ---
  const authId = (await c.query(
    `insert into public.workspace_overage_authorizations
       (account_id, action, cap_cents, terms_version, terms_sha256, authorized_by, authorized_at)
     values ($1, 'enabled', 5000, 'overage-2026-08-19', $2, $3, now()) returning id`,
    [ACCOUNT, SHA, ACCOUNT],
  )).rows[0].id;

  let capless = false;
  try {
    await c.query(
      `insert into public.workspace_overage_settings (account_id, enabled, cap_cents, authorization_id)
       values ($1, true, null, $2)`, [ACCOUNT, authId],
    );
  } catch (err) { capless = err.code === '23514'; }
  ck('enabled-without-a-cap is unrepresentable, not merely discouraged', capless);

  let caplessEvidence = false;
  try {
    await c.query(
      `insert into public.workspace_overage_authorizations
         (account_id, action, cap_cents, terms_version, terms_sha256, authorized_by, authorized_at)
       values ($1, 'enabled', null, 'v', $2, $1, now())`, [ACCOUNT, SHA],
    );
  } catch (err) { caplessEvidence = err.code === '23514'; }
  ck('and evidence of enabling without a cap is refused too', caplessEvidence);

  await c.query(
    `insert into public.workspace_overage_settings (account_id, enabled, cap_cents, authorization_id)
     values ($1, true, 5000, $2)`, [ACCOUNT, authId],
  );

  // --- Accrual ---
  d = await decide(ACCOUNT, 'text_segments', 10, TEXT);
  ck('an authorized overrun accrues', d.decision === 'accrued', d.decision);
  ck('at the rate it was given', Number(d.charged_millicents) === 10 * TEXT, d.charged_millicents);
  ck('and reports the cap in the same units', Number(d.cap_millicents) === 5000 * 1000);

  d = await decide(ACCOUNT, 'marketing_email_sends', 5000, EMAIL);
  ck('a sub-cent rate keeps its fractions', Number(d.charged_millicents) === 5000 * EMAIL, d.charged_millicents);
  ck('...which is $17.00 of email, not $0 and not $50',
    Number(d.charged_millicents) === 1_700_000);

  const rows = (await c.query(
    'select resource_code, units, millicents from public.workspace_overage_accruals where account_id = $1 order by resource_code',
    [ACCOUNT])).rows;
  ck('accruals are kept per resource', rows.length === 2, JSON.stringify(rows));

  // --- The hard stop ---
  d = await decide(ACCOUNT, 'text_segments', 1_000_000, TEXT);
  ck('a charge that would cross the cap is refused', d.decision === 'cap_reached', d.decision);
  ck('...and refused WHOLE, not partly billed', Number(d.charged_millicents) === 0);
  const after = Number((await c.query(
    'select sum(millicents)::bigint as n from public.workspace_overage_accruals where account_id = $1',
    [ACCOUNT])).rows[0].n);
  ck('...leaving the ledger untouched', after === 10 * TEXT + 5000 * EMAIL, String(after));

  // Exactly at the cap is allowed; one millicent past it is not.
  await c.query('delete from public.workspace_overage_accruals where account_id = $1', [ACCOUNT]);
  d = await decide(ACCOUNT, 'text_segments', 1000, 5000); // exactly 5_000_000
  ck('a charge landing exactly on the cap is allowed', d.decision === 'accrued', d.decision);
  d = await decide(ACCOUNT, 'text_segments', 1, 1);
  ck('and the very next millicent is refused', d.decision === 'cap_reached', d.decision);

  // --- Concurrency: the reason this is one statement under one lock ---
  await c.query('delete from public.workspace_overage_accruals where account_id = $1', [ACCOUNT]);
  c2 = pg.getPgClient('lgq_overage');
  await c2.connect();
  await c.query('begin');
  await c2.query('begin');
  // Each of these is 60% of the cap: individually fine, together over.
  const first = decide(ACCOUNT, 'text_segments', 625, 4800, c);   // 3_000_000
  const second = decide(ACCOUNT, 'text_segments', 625, 4800, c2); // 3_000_000
  const d1 = await first;
  // The second is blocked on the row lock until the first commits.
  await c.query('commit');
  const d2 = await second;
  await c2.query('commit');
  const both = [d1.decision, d2.decision].sort().join(',');
  ck('two concurrent charges cannot both slip under one cap',
    both === 'accrued,cap_reached', both);
  const total = Number((await c.query(
    'select sum(millicents)::bigint as n from public.workspace_overage_accruals where account_id = $1',
    [ACCOUNT])).rows[0].n);
  ck('...and the cap was never exceeded', total <= 5000 * 1000, String(total));

  // --- Isolation between workspaces ---
  d = await decide(OTHER, 'text_segments', 1, TEXT);
  ck('another workspace is unaffected by this one being enabled',
    d.decision === 'not_authorized', d.decision);

  // --- Input validation ---
  for (const [label, args] of [
    ['zero units', [ACCOUNT, 'text_segments', 0, TEXT]],
    ['a negative rate', [ACCOUNT, 'text_segments', 1, -1]],
    ['a bad resource code', [ACCOUNT, 'Text Segments', 1, TEXT]],
  ]) {
    let bad = null;
    try {
      await c.query('select * from public.authorize_usage_overage($1,$2,$3,$4,$5,$6)',
        [...args, P0, P1]);
    } catch (err) { bad = err; }
    ck(`refuses ${label}`, bad?.code === '22023', bad?.code);
  }
  let badPeriod = null;
  try {
    await c.query('select * from public.authorize_usage_overage($1,$2,$3,$4,$5,$6)',
      [ACCOUNT, 'text_segments', 1, TEXT, P1, P0]);
  } catch (err) { badPeriod = err; }
  ck('refuses a period that runs backwards', badPeriod?.code === '22023', badPeriod?.code);

  // --- Giving it back when the work failed ---
  await c.query('delete from public.workspace_overage_accruals where account_id = $1', [ACCOUNT]);
  await decide(ACCOUNT, 'text_segments', 10, TEXT);
  const given = Number((await c.query(
    'select public.release_usage_overage($1, $2, $3, $4, $5) as n',
    [ACCOUNT, 'text_segments', P0, 10, 10 * TEXT])).rows[0].n);
  ck('a failed send gives its overage back', given === 10 * TEXT, String(given));
  ck('...leaving nothing accrued', Number((await c.query(
    'select millicents from public.workspace_overage_accruals where account_id = $1 and resource_code = $2',
    [ACCOUNT, 'text_segments'])).rows[0].millicents) === 0);

  const twice = Number((await c.query(
    'select public.release_usage_overage($1, $2, $3, $4, $5) as n',
    [ACCOUNT, 'text_segments', P0, 10, 10 * TEXT])).rows[0].n);
  ck('a double release mints nothing', twice === 0, String(twice));
  ck('...and cannot drive the ledger negative', Number((await c.query(
    'select millicents from public.workspace_overage_accruals where account_id = $1 and resource_code = $2',
    [ACCOUNT, 'text_segments'])).rows[0].millicents) === 0);

  const none = Number((await c.query(
    'select public.release_usage_overage($1, $2, $3, $4, $5) as n',
    [ACCOUNT, 'ai_writing_drafts', P0, 1, 7600])).rows[0].n);
  ck('releasing something never accrued is a no-op', none === 0);

  // --- Disabling ---
  const offId = (await c.query(
    `insert into public.workspace_overage_authorizations
       (account_id, action, cap_cents, terms_version, terms_sha256, authorized_by, authorized_at)
     values ($1, 'disabled', null, 'overage-2026-08-19', $2, $1, now()) returning id`,
    [ACCOUNT, SHA],
  )).rows[0].id;
  await c.query(
    'update public.workspace_overage_settings set enabled = false, cap_cents = null, authorization_id = $2 where account_id = $1',
    [ACCOUNT, offId]);
  d = await decide(ACCOUNT, 'text_segments', 1, TEXT);
  ck('turning it off stops accrual immediately', d.decision === 'not_authorized', d.decision);
  ck('and the evidence of both decisions survives', Number((await c.query(
    'select count(*)::int as n from public.workspace_overage_authorizations where account_id = $1',
    [ACCOUNT])).rows[0].n) === 2);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 300));
} finally {
  try { await c2?.end(); } catch { /* going away */ }
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
