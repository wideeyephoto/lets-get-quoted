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
 * A quoted full signature anywhere in a patcher file --
 * `'public.name(uuid,jsonb)'` -- which is how a migration that patches SEVERAL
 * functions names them, holding the list in an array and casting each to
 * regprocedure in a loop. 20260820100000 does exactly that, and defeated every
 * other pattern here.
 */
const SIGNATURE_RE = /'public\.(\w+)\(/g;
/**
 * A source-patching migration opens with its own idempotency guard --
 * `if strpos(v_def, 'some new text') > 0 then return` -- because it must be safe
 * to re-run. That marker is the migration's own statement of what proves it
 * ran, so it is a better probe than anything this script could invent. The
 * FIRST such guard is the one that means "already patched".
 */
const MARKER_RE = /strpos\(\s*v_(?:def|before)\s*,\s*'((?:[^']|'')+)'\s*\)\s*(?:>\s*0|=\s*0)/;

/**
 * `alter type public.member_role add value if not exists 'office'`. A label
 * either exists in pg_enum or it does not, and nothing else adds it. Anchored on
 * `public.` so the same phrase inside a prose comment cannot match.
 */
const ENUM_RE = /alter type public\.(\w+)\s+add value\s+(?:if not exists\s+)?'([^']+)'/g;
/** `add constraint <name>` -- definitive only when the file does not also drop it. */
const ADD_CONSTRAINT_RE = /add constraint (\w+)/g;
const DROP_CONSTRAINT_RE = /drop constraint (?:if exists )?(\w+)/g;
/**
 * A function created here and RETIRED by a later migration.
 *
 * The constraint logic below already handles drop-and-recreate inside one file.
 * This is the same problem across files, and it produced a PARTIAL that could
 * never be cleared: 20260821194000 creates defer_direct_payment_settlement_task,
 * and 20260821210000 drops it on purpose — the specialised direct-payment worker
 * was retired in favour of the canonical SMS delivery queue. Production was
 * right and the audit was wrong, which is the worse way round: a permanent red
 * teaches people to stop reading the report.
 */
const DROP_FUNCTION_RE = /drop function (?:if exists )?public\.(\w+)/g;
/**
 * Only consulted for a migration that would otherwise be INDETERMINATE.
 *
 * A grant-only migration creates no object and replaces no function, so nothing
 * above can see it. Deliberately NOT applied to migrations that already have
 * proofs: a later migration may revoke what an earlier one granted, and reading
 * that as a gap would reintroduce the exact false positive this pass removes.
 */
const GRANT_TABLE_RE = /grant\s+(select|insert|update|delete|truncate)\s+on\s+table\s+public\.(\w+)\s+to\s+(\w+)/gi;
/** The browser-role TRUNCATE revoke, which leaves no object of its own behind. */
const TRUNCATE_REVOKE_RE = /revoke\s+truncate\s+on\s+all tables in schema public\s+from\s+([\w, ]+)/;

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
  // pg_get_functiondef alone is not a patch -- an assertion-only migration reads
  // a definition to check it and changes nothing. What makes it a patch is the
  // text substitution. Without this, 20260819200000 (which only asserts the
  // canonical reset is untouched) would mark its subject unknowable.
  if (!sql.includes('pg_get_functiondef') || !/\breplace\(\s*v_/.test(sql)) continue;
  // Patchers name their target three ways: a regprocedure literal, a
  // `proname =` filter, or -- as 20260819070000 does -- by passing the name to a
  // local helper as an argument. Rather than chase each shape, take every
  // quoted identifier in the file as a possible target.
  //
  // Over-matching is the SAFE direction here. A wrong guess only suppresses a
  // body comparison, turning a definite answer into "not comparable". Missing a
  // target invents a gap, and a false gap sends somebody to re-run a migration
  // that is already applied.
  const targets = [...sql.matchAll(PATCH_RE)].map((m) => m[1])
    .concat([...sql.matchAll(PATCH_BY_NAME_RE)].map((m) => m[1]))
    .concat([...sql.matchAll(SIGNATURE_RE)].map((m) => m[1]))
    .concat([...sql.matchAll(/'([a-z][a-z0-9_]{6,})'/g)].map((m) => m[1]));
  for (const name of targets) {
    if (!patchedBy.has(name)) patchedBy.set(name, []);
    if (!patchedBy.get(name).includes(file)) patchedBy.get(name).push(file);
  }
}

/**
 * The last thing any migration did to each function: define it, or drop it.
 *
 * `files` is in chronological order, so the final write wins. Within one file a
 * drop-and-recreate pair must resolve to `define`, which is why drops are
 * recorded before definitions below.
 */
const lastFunctionAction = new Map();

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
  const tables = [...sql.matchAll(TABLE_RE)].map((m) => m[1]);
  const newFunctions = [];
  for (const m of sql.matchAll(DROP_FUNCTION_RE)) {
    lastFunctionAction.set(m[1], { file, kind: 'drop' });
  }
  for (const m of sql.matchAll(FUNCTION_RE)) {
    const [, orReplace, name, , body] = m;
    lastDefiner.set(name, file);
    expectedBody.set(name, body);
    lastFunctionAction.set(name, { file, kind: 'define' });
    if (!orReplace) newFunctions.push(name);
  }
  const grants = [...sql.matchAll(GRANT_TABLE_RE)]
    .map((m) => ({ privilege: m[1].toUpperCase(), table: m[2], role: m[3] }));

  // A migration that only source-patches proves itself by its own marker.
  const marker = sql.match(MARKER_RE);
  let patchTarget = null;
  if (marker) {
    const markerIndex = sql.indexOf(marker[0]);
    const beforeMarker = sql.slice(0, markerIndex);
    const pronameMatches = [...beforeMarker.matchAll(PATCH_BY_NAME_RE)].map((m) => m[1]);
    const patchMatches = [...beforeMarker.matchAll(PATCH_RE)].map((m) => m[1])
      .concat([...beforeMarker.matchAll(SIGNATURE_RE)].map((m) => m[1]));
    if (pronameMatches.length > 0) {
      patchTarget = pronameMatches[pronameMatches.length - 1];
    } else if (patchMatches.length > 0) {
      patchTarget = patchMatches[patchMatches.length - 1];
    }
  }
  const patchProbe = patchTarget && marker
    ? { target: patchTarget, text: marker[1].replace(/''/g, "'") }
    : null;

  const enums = [...sql.matchAll(ENUM_RE)].map((m) => ({ type: m[1], value: m[2] }));

  // A dropped-and-recreated constraint keeps its name whichever version is
  // installed, so its existence proves nothing. Only newly added names count.
  const dropped = new Set([...sql.matchAll(DROP_CONSTRAINT_RE)].map((m) => m[1]));
  const constraints = [...new Set([...sql.matchAll(ADD_CONSTRAINT_RE)].map((m) => m[1]))]
    .filter((name) => !dropped.has(name));

  const truncateRevoke = TRUNCATE_REVOKE_RE.exec(sql);
  const revokedFrom = truncateRevoke
    ? truncateRevoke[1].split(',').map((r) => r.trim()).filter((r) => r === 'anon' || r === 'authenticated')
    : [];

  created.set(file, { tables, newFunctions, patchProbe, enums, constraints, revokedFrom, grants });
}

/**
 * Compare CODE, not prose.
 *
 * Line endings first: production has held both CRLF and LF bodies (see
 * 20260817120000), and comparing them raw calls every function stale.
 *
 * Then `--` comments and blank lines. A migration's function body in the repo
 * drifts from the installed one every time somebody improves a comment without
 * re-applying, and 20260816035518 was reported as a gap for exactly that --
 * four added comment lines, not one changed statement. A false gap is the
 * expensive kind of wrong here: it sends somebody to re-run a migration that is
 * already live.
 *
 * Stripping `--` can also cut inside a string literal containing two dashes.
 * That is applied identically to both sides, so it cannot make two different
 * bodies look the same -- only two identical ones stay identical.
 */
const normalise = (s) => s
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/--.*$/, '').trimEnd())
  .filter((line) => line.trim() !== '')
  .join('\n')
  .trim();

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
  const { tables, newFunctions, patchProbe, enums, constraints, revokedFrom, grants } = created.get(file);
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

  for (const { type, value } of enums) {
    const r = await client.query(
      `select exists (
         select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public' and t.typname = $1 and e.enumlabel = $2) as ok`,
      [type, value],
    );
    proofs.push({ what: `enum ${type} has '${value}'`, ok: r.rows[0].ok });
  }

  for (const name of constraints) {
    const r = await client.query(
      'select exists (select 1 from pg_constraint where conname = $1) as ok', [name],
    );
    proofs.push({ what: `constraint ${name}`, ok: r.rows[0].ok });
  }

  for (const role of revokedFrom) {
    // Nothing in public may still grant TRUNCATE to a browser role. Supabase
    // default privileges hand it out on every new table, so this is a standing
    // property, not a one-off: a table added later re-opens the hole.
    const r = await client.query(
      `select count(*)::int as n
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = $1 and privilege_type = 'TRUNCATE'`,
      [role],
    );
    proofs.push({
      what: `no TRUNCATE for ${role}`,
      ok: r.rows[0].n === 0,
      detail: r.rows[0].n === 0 ? '' : `${r.rows[0].n} tables still grant it`,
    });
  }
  // Retired ON PURPOSE by a later migration: its absence is the correct state,
  // so demanding it here is a gap that can never be closed.
  const retiredBy = (fn) => {
    const last = lastFunctionAction.get(fn);
    return last && last.kind === 'drop' && last.file > file ? last.file : null;
  };
  for (const fn of newFunctions) {
    const retired = retiredBy(fn);
    if (retired) {
      proofs.push({ what: `function ${fn}`, ok: true, retired: true, detail: `retired by ${retired}` });
      continue;
    }
    proofs.push({ what: `function ${fn}`, ok: (await functionBodies(fn)).length > 0 });
  }
  for (const fn of owned) {
    if (newFunctions.includes(fn)) continue; // already proved by existence
    const retired = retiredBy(fn);
    if (retired) {
      proofs.push({ what: `function ${fn}`, ok: true, retired: true, detail: `retired by ${retired}` });
      continue;
    }
    const installed = await functionBodies(fn);
    if (installed.length === 0) {
      proofs.push({ what: `function ${fn}`, ok: false, detail: 'absent' });
      continue;
    }
    // A source patch rewrites the installed body on purpose, so a
    // mismatch here proves nothing at all. Never call that a gap.
    const patches = (patchedBy.get(fn) || []).filter((f) => f !== file);
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

  // A grant-only migration leaves no object behind. Probed only when nothing
  // else proved anything, so a later revoke of an earlier grant cannot become
  // the same permanent false gap this pass exists to remove.
  if (proofs.length === 0) {
    for (const g of grants) {
      const r = await client.query(
        `select case when to_regclass('public.' || $2) is null then false
                     else has_table_privilege($1, ('public.' || $2)::regclass, $3) end as ok`,
        [g.role, g.table, g.privilege],
      );
      proofs.push({ what: `${g.role} may ${g.privilege} ${g.table}`, ok: r.rows[0].ok === true });
    }
  }

  let verdict;
  if (proofs.length === 0) {
    verdict = 'INDETERMINATE';
  } else if (proofs.every((p) => p.ok)) {
    verdict = proofs.some((p) => p.patched || p.retired) ? 'PATCHED' : 'APPLIED';
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
