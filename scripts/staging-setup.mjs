import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Build a NON-PRODUCTION database from schema.sql, and prove what landed.
//
// WHY THIS EXISTS RATHER THAN scripts/deploy-schema.mjs. That script reads
// .env.local first and takes DATABASE_URL from it — and .env.local is the
// production connection string. It has no notion of a target, so pointing it at
// staging means remembering to override an environment variable, and forgetting
// means replaying the whole of schema.sql (drop policy / create policy pairs and
// all) against production. Every migration file in this repo already carries a
// warning not to do that. A script whose safety depends on remembering is not a
// safe script, so this one reads a DIFFERENT file and refuses to talk to the
// host the primary file names.
//
// Reads .env.staging.local ONLY. Never falls back to .env.local: a missing
// staging file is an error, not a reason to use production's credentials.
//
// DRY RUN BY DEFAULT, like the other destructive-adjacent scripts here.
//
//   node scripts/staging-setup.mjs              (check the target, change nothing)
//   node scripts/staging-setup.mjs --apply      (deploy schema.sql)

const APPLY = process.argv.includes('--apply');

async function readEnvFile(fileName) {
  const values = new Map();
  try {
    const contents = await readFile(resolve(ROOT, fileName), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      const key = trimmed.slice(0, at).trim();
      const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key) values.set(key, value);
    }
  } catch {
    return null;
  }
  return values;
}

/** Host + database, which is what makes two connection strings the same target. */
function targetOf(connectionString) {
  try {
    const url = new URL(connectionString);
    return { host: url.hostname, database: url.pathname.replace(/^\//, '') || '(default)' };
  } catch {
    return null;
  }
}

const staging = await readEnvFile('.env.staging.local');
if (!staging) {
  console.error('No .env.staging.local found.');
  console.error('');
  console.error('Create it with the four values from your STAGING Supabase project');
  console.error('(Project Settings -> API, and Settings -> Database for the connection string):');
  console.error('');
  console.error('  DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co');
  console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=<service role key>');
  console.error('  ADMIN_EMAILS=you@example.com:admin,support@example.com:support');
  console.error('');
  console.error('It is gitignored alongside .env.local.');
  process.exit(1);
}

const stagingUrl = staging.get('DATABASE_URL');
if (!stagingUrl) {
  console.error('.env.staging.local has no DATABASE_URL.');
  process.exit(1);
}

const stagingTarget = targetOf(stagingUrl);
if (!stagingTarget) {
  console.error('.env.staging.local DATABASE_URL is not a parseable connection string.');
  process.exit(1);
}

// THE REFUSAL. Compared against whatever .env.local names rather than a
// hardcoded hostname, so it keeps working if production ever moves and there is
// no secret baked into a tracked file.
const primary = await readEnvFile('.env.local');
const primaryTarget = primary?.get('DATABASE_URL') ? targetOf(primary.get('DATABASE_URL')) : null;
if (primaryTarget && primaryTarget.host === stagingTarget.host) {
  console.error('REFUSING: .env.staging.local points at the same host as .env.local.');
  console.error(`  host: ${stagingTarget.host}`);
  console.error('');
  console.error('That is the production database. This script replays the whole of');
  console.error('schema.sql, including drop policy / create policy pairs, and must never');
  console.error('run against it. Point .env.staging.local at a separate Supabase project.');
  process.exit(1);
}

console.log('Target (staging):');
console.log(`  host      ${stagingTarget.host}`);
console.log(`  database  ${stagingTarget.database}`);
console.log(primaryTarget ? `  distinct from .env.local host (${primaryTarget.host}) — OK` : '  no .env.local DATABASE_URL to compare against');

const client = new Client({ connectionString: stagingUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

// Every table the admin console reads. If schema.sql and the migrations ever
// drift apart again, this is where it shows up: the tables are listed here by
// name, so a table that exists only in a migration fails this check.
const ADMIN_TABLES = [
  'admin_actions',
  'webhook_failures',
  'email_events',
  'platform_incidents',
  'support_cases',
  'support_case_notes',
  'account_notes',
  'account_tags',
  'account_attachments',
  'privacy_requests',
  'login_events',
];

try {
  const { rows: [version] } = await client.query('select version()');
  console.log(`  server    ${String(version.version).split(',')[0]}`);

  const { rows: [before] } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
  );
  console.log(`\nPublic tables before: ${before.n}`);

  if (!APPLY) {
    console.log('\nDry run. Nothing was deployed. Re-run with --apply to build the schema.');
    process.exit(0);
  }

  console.log('\n*** APPLYING schema.sql ***');
  const schema = await readFile(resolve(ROOT, 'schema.sql'), 'utf8');
  await client.query('create schema if not exists public');
  await client.query(schema);
  console.log('schema.sql applied.');

  const { rows: [after] } = await client.query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
  );
  console.log(`Public tables after:  ${after.n}`);

  // Presence, RLS, and — the one that actually matters for these — that no
  // policy exists. A policy on any of them would expose an internal staff
  // surface through the anon key.
  const { rows: tableRows } = await client.query(
    `select c.relname as table_name,
            c.relrowsecurity as rls,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [ADMIN_TABLES],
  );
  const found = new Map(tableRows.map((row) => [row.table_name, row]));

  console.log('\nAdmin console tables:');
  let bad = 0;
  for (const table of ADMIN_TABLES) {
    const row = found.get(table);
    if (!row) {
      console.log(`  MISSING  ${table}`);
      bad += 1;
      continue;
    }
    const rlsOk = row.rls === true;
    const policyOk = row.policies === 0;
    if (!rlsOk || !policyOk) bad += 1;
    console.log(
      `  ${rlsOk && policyOk ? 'ok      ' : 'PROBLEM '} ${table.padEnd(20)} rls=${rlsOk ? 'on' : 'OFF'} policies=${row.policies}${policyOk ? '' : ' <- must be 0'}`,
    );
  }

  const { rows: columnRows } = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'accounts'
        and column_name like 'payouts_restricted%'
      order by column_name`,
  );
  console.log(`\naccounts payout-restriction columns: ${columnRows.map((r) => r.column_name).join(', ') || 'NONE — expected three'}`);
  if (columnRows.length !== 3) bad += 1;

  const { rows: bucketRows } = await client.query(`select id from storage.buckets where id = 'account-attachments'`);
  console.log(`account-attachments storage bucket: ${bucketRows.length ? 'present' : 'MISSING'}`);
  if (bucketRows.length === 0) bad += 1;

  if (bad > 0) {
    console.error(`\n${bad} problem(s) above. schema.sql and the migrations have drifted.`);
    process.exitCode = 1;
  } else {
    console.log('\nStaging schema is complete and every staff table is RLS-on/policy-free.');
    console.log('\nNext, to fill it with something to look at:');
    console.log('  $env:DATABASE_URL=(staging url); node scripts/seed-customers.mjs --account <uuid> --apply');
    console.log('  (the env loaders let an already-set DATABASE_URL win, so this targets staging)');
  }
} catch (error) {
  console.error('\nFailed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
