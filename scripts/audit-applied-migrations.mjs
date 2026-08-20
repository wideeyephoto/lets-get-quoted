/**
 * READ ONLY. Which migrations are actually live in production?
 *
 * WHY THIS EXISTS, AND WHY THE OTHER AUDIT DID NOT CATCH IT.
 * `audit-migration-dependencies.mjs` walks the outstanding migrations and checks
 * that every object each one references either exists already OR is created by
 * an earlier migration IN THE SEQUENCE. That is an ORDERING check. It assumes
 * the whole sequence gets applied, so it reports a clean 62/62 on a database
 * where the foundation of that sequence was never run.
 *
 * That is exactly what happened on 2026-08-20. `20260819080000` -- which creates
 * workspace_overage_settings, workspace_overage_accruals and the two overage
 * functions -- had never been applied, and nothing said so. The next migration
 * to reach for those tables failed with a PL/pgSQL compile error about a
 * relation not existing, four files after the actual gap.
 *
 * HOW IT DECIDES, in descending order of confidence:
 *
 *   1. A table the migration CREATES either exists or it does not. Definitive.
 *   2. A function the migration CREATES (not `or replace`) likewise. Definitive.
 *   3. For `create or replace function`, existence proves nothing -- the function
 *      may predate the file. So it compares the installed `prosrc` against the
 *      body in the file, for the LAST migration that defines that function.
 *      Matching bodies mean that migration is live. A different body means an
 *      OLDER definition is still installed.
 *
 * WHAT IT CANNOT DETERMINE, and says so rather than guessing: migrations that
 * create no object and replace no function -- `alter type ... add value`, added
 * constraints, grants and revokes, pure assertion migrations. Those need their
 * own probe and are reported as INDETERMINATE, never as applied.
 *
 * SOURCE-PATCHING MIGRATIONS. Twenty files in this repo do not restate a
 * function but edit the INSTALLED one: `pg_get_functiondef`, an exact-text
 * replace, an assertion that the replace matched exactly once. After one of
 * those runs, the live body legitimately differs from the body in the migration
 * that originally created the function -- so comparing them reports that earlier
 * migration as stale when both are applied. The first draft of this audit did
 * exactly that and cried wolf on 20260818160000.
 *
 * So a function that any LATER migration source-patches is not body-compared at
 * all. It is reported as ok*: unknowable this way, and never counted as a gap.
 *
 * Line endings are normalised before comparing. Production has held both CRLF
 * and LF function bodies (see 20260817120000), and comparing them raw reports
 * every function as stale.
 *
 *   node scripts/audit-applied-migrations.mjs
 *   node scripts/audit-applied-migrations.mjs --since=20260818000000
 *   node scripts/audit-applied-migrations.mjs --unapplied   # only the gaps
 *
 * Reads DATABASE_URL from .env.local. Opens one connection, writes nothing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'migrations');

const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const SINCE = arg('since', '20260818000000');
const ONLY_GAPS = process.argv.includes('--unapplied');

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    console.error('.env.local not found. This audit reads production and cannot run without it.');
    process.exit(2);
  }
  const match = raw.match(/^DATABASE_URL=(.*)$/m);
  if (!match) {
    console.error('DATABASE_URL is not set in .env.local.');
    process.exit(2);
  }
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Function definitions, with their dollar-quoted body. The tag is captured and
 * back-referenced so a body containing `$$` inside a nested block cannot end the
 * match early.
 */
const FUNCTION_RE =
  /create (or replace )?function public\.(\w+)\s*\([\s\S]*?\)\s*returns[\s\S]*?\sas\s+(\$\w*\$)([\s\S]*?)\3/g;
const TABLE_RE = /create table (?:if not exists )?public\.(\w+)/g;
/** `pg_get_functiondef('public.name(args)'::regprocedure)` -- a source patch. */
const PATCH_RE = /pg_get_functiondef\(\s*'public\.(\w+)\(/g;
/**
 * The other shape the same idea takes: `pg_get_functiondef(p.oid)` selected out
 * of pg_proc with a `proname =` filter. Only consulted when the file calls
 * pg_get_functiondef at all, so an ordinary `proname =` lookup is not mistaken
 * for a patch.
 */
const PATCH_BY_NAME_RE = /\bproname\s*=\s*'(\w+)'/g;
/**
 * A source-patching migration opens with its own idempotency guard --
 * `if strpos(v_def, 'some new text') > 0 then return` -- because it must be safe
 * to re-run. That marker is the migration's own statement of what proves it
 * ran, so it is a better probe than anything this script could invent. The
 * FIRST such guard is the one that means "already patched".
 */
const MARKER_RE = /strpos\(\s*v_(?:def|before)\s*,\s*'((?:[^']|'')+)'\s*\)\s*(?:>\s*0|=\s*0)/;

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && f.split('_')[0] >= SINCE)
  .sort();

if (files.length === 0) {
  console.error(`No migrations at or after ${SINCE}.`);
  process.exit(2);
}

/** Only the LAST migration to define a function owns the body that should be live. */
const lastDefiner = new Map();
const expectedBody = new Map();
const created = new Map();
const patchedBy = new Map();

// Every migration, not only those in range: a patch applied last week still
// makes an in-range body comparison meaningless.
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
  if (!sql.includes('pg_get_functiondef')) continue;
  const targets = [...sql.matchAll(PATCH_RE)].map((m) => m[1])
    .concat([...sql.matchAll(PATCH_BY_NAME_RE)].map((m) => m[1]));
  for (const name of targets) {
    if (!patchedBy.has(name)) patchedBy.set(name, []);
    if (!patchedBy.get(name).includes(file)) patchedBy.get(name).push(file);
  }
}

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
  const tables = [...sql.matchAll(TABLE_RE)].map((m) => m[1]);
  const newFunctions = [];
  for (const m of sql.matchAll(FUNCTION_RE)) {
    const [, orReplace, name, , body] = m;
    lastDefiner.set(name, file);
    expectedBody.set(name, body);
    if (!orReplace) newFunctions.push(name);
  }

  // A migration that only source-patches proves itself by its own marker.
  const patches = sql.includes('pg_get_functiondef')
    ? [...sql.matchAll(PATCH_RE)].map((m) => m[1])
      .concat([...sql.matchAll(PATCH_BY_NAME_RE)].map((m) => m[1]))
    : [];
  const marker = sql.match(MARKER_RE);
  const patchProbe = patches.length > 0 && marker
    ? { target: patches[0], text: marker[1].replace(/''/g, "'") }
    : null;

  created.set(file, { tables, newFunctions, patchProbe });
}

const normalise = (s) => s.replace(/\r\n/g, '\n').trim();

const client = new pg.Client({
  connectionString: readEnv(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tableExists = async (name) =>
  (await client.query("select to_regclass('public.' || $1) is not null as ok", [name])).rows[0].ok;

const functionBodies = async (name) =>
  (await client.query(
    `select p.prosrc from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [name],
  )).rows.map((r) => r.prosrc);

const results = [];

for (const file of files) {
  const { tables, newFunctions, patchProbe } = created.get(file);
  const owned = [...lastDefiner.entries()].filter(([, f]) => f === file).map(([n]) => n);

  const proofs = [];

  if (patchProbe) {
    const installed = await functionBodies(patchProbe.target);
    proofs.push({
      what: `patch to ${patchProbe.target}`,
      ok: installed.some((body) => body.includes(patchProbe.text)),
      detail: `looked for ${JSON.stringify(patchProbe.text)} in the installed body`,
    });
  }

  for (const table of tables) {
    proofs.push({ what: `table ${table}`, ok: await tableExists(table) });
  }
  for (const fn of newFunctions) {
    proofs.push({ what: `function ${fn}`, ok: (await functionBodies(fn)).length > 0 });
  }
  for (const fn of owned) {
    if (newFunctions.includes(fn)) continue; // already proved by existence
    const installed = await functionBodies(fn);
    if (installed.length === 0) {
      proofs.push({ what: `function ${fn}`, ok: false, detail: 'absent' });
      continue;
    }
    // A later source patch rewrites the installed body on purpose, so a
    // mismatch here proves nothing at all. Never call that a gap.
    const patches = (patchedBy.get(fn) || []).filter((f) => f > file);
    if (patches.length > 0) {
      proofs.push({
        what: `body of ${fn}`,
        ok: true,
        patched: true,
        detail: `source-patched by ${patches.join(', ')}; not comparable`,
      });
      continue;
    }
    const match = installed.some((body) => normalise(body) === normalise(expectedBody.get(fn)));
    proofs.push({ what: `body of ${fn}`, ok: match, detail: match ? '' : 'an older definition is installed' });
  }

  let verdict;
  if (proofs.length === 0) {
    verdict = 'INDETERMINATE';
  } else if (proofs.every((p) => p.ok)) {
    verdict = proofs.some((p) => p.patched) ? 'PATCHED' : 'APPLIED';
  } else if (proofs.every((p) => !p.ok)) {
    verdict = 'NOT APPLIED';
  } else {
    verdict = 'PARTIAL';
  }

  results.push({ file, verdict, proofs });
}

await client.end();

const LABEL = {
  APPLIED: 'ok       ',
  PATCHED: 'ok*      ',
  'NOT APPLIED': 'MISSING  ',
  PARTIAL: 'PARTIAL  ',
  INDETERMINATE: 'unknown  ',
};

for (const { file, verdict, proofs } of results) {
  if (ONLY_GAPS && (verdict === 'APPLIED' || verdict === 'PATCHED')) continue;
  console.log(`${LABEL[verdict]}${file}`);
  if (verdict === 'APPLIED') continue;
  if (verdict === 'PATCHED') {
    for (const p of proofs.filter((x) => x.patched)) console.log(`           ${p.detail}`);
    continue;
  }
  if (verdict === 'INDETERMINATE') {
    console.log('           creates no object and replaces no function; needs its own probe');
    continue;
  }
  for (const p of proofs.filter((x) => !x.ok)) {
    console.log(`           missing: ${p.what}${p.detail ? ` (${p.detail})` : ''}`);
  }
}

const count = (v) => results.filter((r) => r.verdict === v).length;
const gaps = count('NOT APPLIED') + count('PARTIAL');

console.log(
  `\n${count('APPLIED')} applied, ${count('PATCHED')} applied-but-source-patched,`
  + ` ${gaps} with gaps, ${count('INDETERMINATE')} undetermined,`
  + ` of ${results.length} since ${SINCE}`,
);
if (count('INDETERMINATE') > 0) {
  console.log('"undetermined" is not "applied" -- those change nothing this audit can see.');
}

// A gap is the thing this exists to find, so it exits non-zero on one.
process.exit(gaps === 0 ? 0 : 1);
