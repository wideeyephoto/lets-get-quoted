/**
 * Prove what PostgreSQL actually STORES in pg_proc.proconfig for the config
 * clauses 20260818234500 recreates its function with.
 *
 * WHY THIS EXISTS. That migration guards its drop-and-recreate by comparing the
 * live proconfig against a hand-written array, to make sure a SECURITY DEFINER
 * function does not silently lose its pinned search_path. The array was written
 * from the DDL text -- array['search_path=', 'timezone=UTC'] -- and PostgreSQL
 * stores the NORMALISED form: search_path="" with quotes, and the GUC name
 * canonicalised to TimeZone. It therefore matched nothing on any engine, and the
 * migration could not run anywhere. Production refused it at 55000 with a
 * completely healthy config.
 *
 * The source test asserted the same wrong string, so it passed throughout. Only
 * an engine can settle this, which is what this does.
 *
 * Not part of the default suite -- see scripts/verify-storage-usage-migration.mjs
 * for the one npm command it needs. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIRS = [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
];

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

for (const dir of BIN_DIRS) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-proconfig-'));
const port = Number(process.env.LGQ_PROCONFIG_CHECK_PORT || 54334);

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

/** What Production reports for settle_direct_checkout_late_success_task. */
const PRODUCTION_SHAPE = ['search_path=""', 'TimeZone=UTC'];

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port,
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_proconfig_check');
  c = pg.getPgClient('lgq_proconfig_check');
  await c.connect();

  // Byte-for-byte the clauses the migration's recreate DDL declares.
  await c.query(`
    create function public.probe_settle() returns boolean
    language plpgsql
    security definer
    set search_path = ''
    set timezone to 'UTC'
    as $f$ begin return true; end $f$;
  `);

  const stored = (await c.query(
    `select proconfig from pg_catalog.pg_proc
      where oid = 'public.probe_settle()'::regprocedure`,
  )).rows[0].proconfig;

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  ck('the engine stores the same shape Production reports',
    eq(stored, PRODUCTION_SHAPE), JSON.stringify(stored));

  ck('the DDL-spelled array matches nothing, as Production proved',
    !eq(stored, ['search_path=', 'timezone=UTC']), JSON.stringify(stored));

  // The corrected guard, evaluated by the engine rather than restated here.
  const guard = (await c.query(`
    select
      pg_catalog.array_length(p.proconfig, 1) = 2
      and exists (
        select 1 from pg_catalog.unnest(p.proconfig) as s
         where pg_catalog.btrim(s) in ('search_path=""', 'search_path=')
      )
      and exists (
        select 1 from pg_catalog.unnest(p.proconfig) as s
         where pg_catalog.lower(pg_catalog.btrim(s)) = 'timezone=utc'
      ) as ok
    from pg_catalog.pg_proc p
    where p.oid = 'public.probe_settle()'::regprocedure`)).rows[0].ok;
  ck('the corrected guard accepts a correctly configured function', guard === true);

  // And still refuses one that is genuinely wrong, which is the whole point.
  await c.query(`
    create function public.probe_unpinned() returns boolean
    language plpgsql
    security definer
    set search_path = 'public'
    set timezone to 'UTC'
    as $f$ begin return true; end $f$;
  `);
  const unpinned = (await c.query(`
    select exists (
      select 1 from pg_catalog.unnest(p.proconfig) as s
       where pg_catalog.btrim(s) in ('search_path=""', 'search_path=')
    ) as ok
    from pg_catalog.pg_proc p
    where p.oid = 'public.probe_unpinned()'::regprocedure`)).rows[0].ok;
  ck('the corrected guard still refuses a non-empty search_path', unpinned === false);

  // The migration's own text must agree with what the engine just showed.
  const sql = readFileSync(
    join(REPO, 'migrations', '20260818234500_late_success_settle_reports_moved_evidence.sql'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  // Executable SQL only: the file's own comment QUOTES the broken array in order
  // to explain it, so a naive search hits the explanation. Same trap the
  // purchased-capacity migration test documents, and it caught this check first.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  ck('the migration no longer compares against the DDL spelling',
    !statements.includes("array['search_path=', 'timezone=UTC']"));
  ck('the migration checks the property instead',
    sql.includes("'search_path=\"\"', 'search_path='")
    && sql.includes("= 'timezone=utc'"));
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
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
