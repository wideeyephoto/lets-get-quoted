/**
 * READ ONLY. Decides whether staging-db is a usable rehearsal target for the
 * outstanding migration sequence, or an empty project that would tell us nothing.
 *
 * The repo does not contain the base schema — no migration here creates
 * public.payments — so migrations can only be rehearsed somewhere that already
 * has it. If staging mirrors production, the sixteen outstanding migrations can
 * be run there first, in the documented order, before production sees any of
 * them. If it is near-empty they would fail on missing base tables, which proves
 * nothing about the sequence and wastes the attempt.
 *
 * Compares against production as read on 2026-08-17.
 *
 *   STAGING_DATABASE_URL="postgres://..." node scripts/assess-staging-db.mjs
 *
 * Falls back to STAGING_DATABASE_URL in .env.local so the credential never has
 * to appear on a command line.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Production, for comparison.
const PROD = {
  paymentsColumns: 56,
  highWater: '20260816072239',
  hasClaimToken: false,          // 20260815224559 was skipped
  hasSubmissionStartedAt: false,
};

function resolveConnection() {
  if (process.env.STAGING_DATABASE_URL) return process.env.STAGING_DATABASE_URL;
  const candidates = [
    join(ROOT, '.env.local'),
    'C:/dev/CLAUDE CODE FOLDER/.env.local',
    join(ROOT, '..', 'CLAUDE CODE FOLDER', '.env.local'),
  ];
  for (const file of candidates) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('STAGING_DATABASE_URL=')) continue;
      const value = line.slice('STAGING_DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      if (value) { console.log(`connection read from ${file}`); return value; }
    }
  }
  throw new Error(
    'no staging connection: set STAGING_DATABASE_URL, or add a STAGING_DATABASE_URL= line to .env.local',
  );
}

const client = new pg.Client({
  connectionString: resolveConnection(),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const one = async (sql) => (await client.query(sql)).rows[0];

  const target = await one("select current_database() as db, inet_server_addr()::text as addr");
  console.log(`\nconnected to ${target.db}`);

  const shape = await one(`
    select
      (select count(*)::int from information_schema.columns
        where table_schema='public' and table_name='payments')                as payments_columns,
      (select count(*)::int from information_schema.tables
        where table_schema='public')                                          as public_tables,
      (select count(*)::int from information_schema.columns
        where table_schema='public' and table_name='billing_payment_operations') as bpo_columns,
      (select count(*)::int from public.payments)                             as payment_rows`);
  console.log('\n--- schema shape');
  console.table([{ ...shape, production_payments_columns: PROD.paymentsColumns }]);

  const history = await one(`
    select
      (select count(*)::int from supabase_migrations.schema_migrations) as applied,
      (select max(version)  from supabase_migrations.schema_migrations) as high_water`);
  console.log('\n--- migration history');
  console.table([{ ...history, production_high_water: PROD.highWater }]);

  const artifacts = await client.query(`
    select column_name from information_schema.columns
     where table_schema='public' and table_name='billing_payment_operations'
       and column_name in ('claim_token','submission_started_at')
     order by column_name`);
  console.log('\n--- artifacts of the skipped 20260815224559 (production has neither)');
  console.table(artifacts.rows.length ? artifacts.rows : [{ column_name: 'neither present' }]);

  const dest = await one(`
    select count(*)::int as destination_pointers from public.payments
     where charge_model = 'destination' and stripe_checkout_session is not null`);
  console.log(`\ndestination Session pointers on staging: ${dest.destination_pointers}`);

  // Verdict.
  const usable = shape.payments_columns >= PROD.paymentsColumns - 5 && shape.public_tables > 20;
  console.log('\n=== VERDICT ===');
  if (usable) {
    console.log('USABLE rehearsal target: staging carries the base schema.');
    console.log('Run the sixteen outstanding migrations here first, 20260815224559 leading,');
    console.log('20260816221500 last. Any destination pointers above must be cleared first,');
    console.log('exactly as production required.');
  } else {
    console.log('NOT a usable rehearsal target: staging lacks the base schema.');
    console.log(`payments has ${shape.payments_columns} columns against production's ${PROD.paymentsColumns},`);
    console.log(`and public holds ${shape.public_tables} tables. The migrations would fail on missing`);
    console.log('base tables, which proves nothing about the sequence. Either restore a production');
    console.log('schema dump into staging first, or apply to production directly with the');
    console.log('foundation last and its preflight as the backstop.');
  }
} catch (error) {
  console.error('\nFAILED:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
