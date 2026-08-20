// Contract test for 20260820150000_zero_dedicated_business_number_allowance.sql,
// against a real PostgreSQL 17 rather than against the file as text.
//
// The migration patches an installed function body by exact text match. Reading
// it proves nothing about the three things that actually go wrong with that
// shape: tag-delimited dollar quoting (an untagged pair closes the DO body early
// and the error surfaces thousands of characters away), the exactly-once
// assertion (a needle that matches twice must REFUSE, not patch the wrong plan),
// and idempotency (25 migrations here re-run, and a second application must be a
// no-op rather than a second edit).
//
// It runs against a STUB function carrying the same three plan branches, not the
// real projector, because the base schema is not replayable from this repo -- no
// migration creates public.payments. That is a real limit: this verifies the
// migration against its own assumptions. What it does NOT prove is that
// production's body matches the anchors; that is proven separately by reading
// pg_get_functiondef off production directly.
//
// Boots its own throwaway cluster and never reads LGQ_PG17_DATABASE_URL, so it
// cannot reach a hosted database at all.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = 'migrations/20260820150000_zero_dedicated_business_number_allowance.sql';
const PORT = Number(process.env.LGQ_DEDICATED_NUMBER_CHECK_PORT || 54351);

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. This check needs a real engine:\n'
    + '  npm install --no-save embedded-postgres@17.10.0-beta.17 '
    + '@embedded-postgres/windows-x64@17.10.0-beta.17\n'
    + '  (cd node_modules/@embedded-postgres/windows-x64 && node scripts/hydrate-symlinks.js)',
  );
  // Exit 2, not 0. A missing dependency is not a pass.
  process.exit(2);
}

// The re-exec'd backend cannot find its DLLs unless the bin dir is on PATH.
const BIN = join(process.cwd(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
process.env.PATH = `${BIN}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

/** The three paid branches, copied verbatim from the live production body. */
const STUB_BODY = `
create or replace function public.lgq_stub_expected_limits(p_plan text)
returns jsonb
language plpgsql
as $fn$
declare
  v_expected_feature_limits jsonb;
  v_plan_code text := p_plan;
begin
  v_expected_feature_limits := case v_plan_code
    when 'solo' then pg_catalog.jsonb_build_object(
      'office_users', 1, 'crew_users', 2, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 10, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
      'voice_history_days', 30, 'voice_included_minutes', 0
    )
    when 'growth' then pg_catalog.jsonb_build_object(
      'office_users', 5, 'crew_users', 10, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 100, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
      'voice_history_days', 30, 'voice_included_minutes', 0
    )
    when 'scale' then pg_catalog.jsonb_build_object(
      'office_users', 15, 'crew_users', 50, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 250, 'quickbooks_connections', 1,
      'forwarding_minutes', 200, 'voice_concurrent_calls', 3,
      'voice_history_days', 90, 'voice_included_minutes', 100
    )
    else null end;
  if v_expected_feature_limits is null then
    raise exception 'Stripe Billing projection does not match the canonical catalog';
  end if;
  return v_expected_feature_limits;
end;
$fn$;
`;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const pg = new EmbeddedPostgres({
  databaseDir: join(process.cwd(), '.pg17-dedicated-number-check'),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_check');
  const { Client } = await import('pg');
  client = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'lgq_check' });
  await client.connect();

  // The migration targets the real projector's signature. Point it at the stub
  // by giving the stub that exact name and argument list.
  const migrationSql = readFileSync(MIGRATION, 'utf8')
    .replace(
      /public\.project_stripe_billing_subscription_event_v1_unchecked\(uuid,uuid,jsonb\)/g,
      'public.lgq_stub_expected_limits(text)',
    );

  const limitsOf = async () => {
    const { rows } = await client.query(
      "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
      + " where n.nspname = 'public' and proname = 'lgq_stub_expected_limits'",
    );
    return rows[0].d;
  };
  const count = (haystack, needle) => haystack.split(needle).length - 1;

  await client.query(STUB_BODY);
  const before = await limitsOf();
  check('stub installs with three granted numbers', count(before, "'dedicated_business_numbers', 1") === 3);

  await client.query(migrationSql);
  const after = await limitsOf();
  check('all three paid plans now grant zero', count(after, "'dedicated_business_numbers', 0") === 3);
  check('no branch still grants one', count(after, "'dedicated_business_numbers', 1") === 0);
  check('storage allowances untouched',
    count(after, "'storage_gb', 10,") === 1 && count(after, "'storage_gb', 100,") === 1 && count(after, "'storage_gb', 250,") === 1);
  check('seat allowances untouched',
    count(after, "'office_users', 1,") === 1 && count(after, "'office_users', 5,") === 1 && count(after, "'office_users', 15,") === 1);
  check('the canonical-catalog guard survived', after.includes('does not match the canonical catalog'));

  // The function still has to WORK, not merely contain the right text.
  const { rows: solo } = await client.query("select public.lgq_stub_expected_limits('solo') j");
  check('solo projects dedicated_business_numbers 0', solo[0].j.dedicated_business_numbers === 0,
    JSON.stringify(solo[0].j.dedicated_business_numbers));

  // Re-running is the norm here, not the exception.
  await client.query(migrationSql);
  const twice = await limitsOf();
  check('second application is a no-op', twice === after);

  // The exactly-once assertion must REFUSE a body where an anchor is ambiguous.
  await client.query(STUB_BODY);
  await client.query(
    STUB_BODY.replace("when 'growth' then", "when 'growth2' then").replace(
      'lgq_stub_expected_limits(p_plan text)', 'lgq_stub_ambiguous(p_plan text)'),
  );
  // Duplicate the solo branch inside the stub so its anchor matches twice.
  const ambiguous = STUB_BODY.replace(
    "    else null end;",
    `    when 'solo_copy' then pg_catalog.jsonb_build_object(
      'office_users', 1, 'crew_users', 2, 'custom_domain_connections', 1,
      'dedicated_business_numbers', 1, 'storage_gb', 10, 'quickbooks_connections', 1,
      'forwarding_minutes', 100, 'voice_concurrent_calls', 1,
      'voice_history_days', 30, 'voice_included_minutes', 0
    )
    else null end;`,
  );
  await client.query(ambiguous);
  let refused = false;
  try {
    await client.query(migrationSql);
  } catch (error) {
    refused = /source contract drifted/.test(error.message);
  }
  check('refuses when an anchor is ambiguous', refused);
} catch (error) {
  check('harness ran to completion', false, error.message);
} finally {
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* cluster already gone */ }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 9) {
  console.error('the harness did not run every check; a short run is not a pass');
  process.exit(2);
}
process.exit(failed.length === 0 ? 0 : 1);
