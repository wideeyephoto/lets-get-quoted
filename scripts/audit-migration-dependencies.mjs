/**
 * READ ONLY. Walks the outstanding migrations in their documented order and
 * checks, for each one, that every schema-qualified object it references either
 * already exists in production or is created by an earlier migration in the
 * sequence.
 *
 * This catches the failure that sequencing actually risks: a migration reaching
 * for an object that is not there yet. It is what went wrong with the skipped
 * 20260815224559 -- three later migrations use its columns and functions, and
 * without it they fail on a missing object rather than on anything meaningful.
 *
 * What it does NOT catch, and must not be mistaken for:
 *
 * - **Column-level dependencies.** It only sees schema-qualified names, so
 *   `public.some_function` is checked but `v_operation.submission_started_at` is
 *   not. Dropping 20260815224559 from the sequence surfaces one miss, not the
 *   three migrations that actually need it -- the other two depend on columns it
 *   adds, and those references are invisible here.
 * - Data-dependent refusals. 20260816221500's preflight is one, by design.
 * - Constraint violations against real rows, and anything about runtime
 *   behaviour.
 *
 * A clean report means "no schema-qualified object is missing in this order",
 * which is narrower than "these will succeed". Run with --without=<substring> to
 * confirm it still detects a gap before trusting a clean run.
 *
 *   node scripts/audit-migration-dependencies.mjs
 *
 * Reads DATABASE_URL from .env.local. Opens one connection, runs catalogue
 * queries, writes nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'migrations');

/** The documented order: the skipped one first, then the tail in timestamp order. */
const ALL = [
  '20260815224559_direct_checkout_operation_orchestration.sql',
  ...readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && f.split('_')[0] > '20260816070134')
    .sort(),
];

/**
 * --without=<substring> drops a migration from the sequence, so the audit can be
 * shown to detect a real gap rather than only ever reporting OK. Dropping
 * 20260815224559 should make the three migrations that use its artifacts miss;
 * if it does not, this tool is not checking anything.
 */
const WITHOUT = process.argv.find((a) => a.startsWith('--without='))?.slice('--without='.length);
const SEQUENCE = WITHOUT ? ALL.filter((f) => !f.includes(WITHOUT)) : ALL;
if (WITHOUT) console.log(`[dropping migrations matching "${WITHOUT}" to test detection]\n`);

function resolveConnection() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;
  for (const file of [join(ROOT, '.env.local'), 'C:/dev/CLAUDE CODE FOLDER/.env.local']) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('DATABASE_URL=')) {
        const v = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
        if (v) return v;
      }
    }
  }
  throw new Error('no DATABASE_URL found');
}

/** Objects a migration creates, so later ones in the sequence may rely on them. */
function created(sql) {
  const out = new Set();
  const patterns = [
    /create\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:table|function|view|materialized\s+view|type|index|trigger)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    /alter\s+table\s+(?:only\s+)?public\.([a-z_][a-z0-9_]*)[\s\S]*?add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
  ];
  for (const m of sql.matchAll(patterns[0])) out.add(m[1].toLowerCase());
  for (const m of sql.matchAll(patterns[1])) out.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  // A rename brings a name into existence just as a create does, and this
  // sequence uses one: 20260816161844 renames a function and then calls it
  // under the new name. Without this the audit reports a dependency gap that
  // the migration satisfies itself.
  for (const m of sql.matchAll(/rename\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi)) out.add(m[1].toLowerCase());
  return out;
}

/** Schema-qualified objects a migration reaches for. */
function referenced(sql) {
  const stripped = sql.replace(/--[^\n]*/g, ' ');
  const out = new Set();
  for (const m of stripped.matchAll(/public\.([a-z_][a-z0-9_]*)/gi)) out.add(m[1].toLowerCase());
  return out;
}

const client = new pg.Client({ connectionString: resolveConnection(), ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const existing = new Set(
    (await client.query(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      union select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      union select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
    `)).rows.map((r) => r.name.toLowerCase()),
  );
  console.log(`production public schema: ${existing.size} objects\n`);

  const cumulative = new Set(existing);
  let problems = 0;

  for (const file of SEQUENCE) {
    let sql;
    try { sql = readFileSync(join(MIGRATIONS, file), 'utf8'); } catch { console.log(`SKIP  ${file} (not found)`); continue; }

    const needs = referenced(sql);
    const makes = created(sql);
    // Same-migration creations satisfy same-migration references.
    const missing = [...needs].filter((n) => !cumulative.has(n) && !makes.has(n));

    if (missing.length === 0) {
      console.log(`OK    ${file}`);
    } else {
      problems += 1;
      console.log(`MISS  ${file}`);
      console.log(`        missing: ${missing.sort().join(', ')}`);
    }
    for (const m of makes) cumulative.add(m.includes('.') ? m.split('.')[1] : m);
  }

  console.log(`\n=== ${SEQUENCE.length - problems}/${SEQUENCE.length} migrations have every referenced object available ===`);
  if (problems) {
    console.log('A MISS means that migration would fail on a missing object in this order.');
    process.exitCode = 1;
  } else {
    console.log('No missing-object failures in this order. This says nothing about');
    console.log('data-dependent refusals -- 20260816221500 still gates on its preflight.');
  }
} catch (error) {
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
