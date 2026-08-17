// Apply ONE migration file from migrations/ to the database in DATABASE_URL.
//
// WHY THIS EXISTS. Every file in migrations/ carries the same warning: do not
// apply it with deploy-schema.mjs, because that replays the whole of schema.sql
// — including its drop policy / create policy pairs — against a live database.
// The stated alternative was "paste it into the Supabase SQL editor", which is
// fine until you want the same change applied the same way twice, or want the
// before/after state recorded rather than eyeballed.
//
//   node scripts/run-migration.mjs 2026-08-06-lead-lost-after-days.sql
//   node scripts/run-migration.mjs <file> --check      (connect, report, change nothing)
//
// SAFETY. A lock_timeout is set before the file runs. Every migration here takes
// ACCESS EXCLUSIVE on a table for at least a moment, and on a table as busy as
// accounts, waiting for that lock behind one long transaction queues every
// request that arrives behind it. Failing fast and retrying is strictly better
// than a stall that looks like an outage. statement_timeout is the same argument
// for the work itself.
//
// The file supplies its own begin/commit, so this does not add a transaction of
// its own — wrapping one around it would silently change the semantics of any
// migration that deliberately commits in stages.

import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(__dirname, '..', fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const at = trimmed.indexOf('=');
        if (at === -1) continue;
        const key = trimmed.slice(0, at).trim();
        const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // Ignore missing files and continue to the next candidate.
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const name = args.find((arg) => !arg.startsWith('--'));

  if (!name) {
    console.error('Usage: node scripts/run-migration.mjs <file-in-migrations> [--check]');
    process.exit(1);
  }

  // Only ever from migrations/, and only ever the basename of what was asked
  // for — this reads a file and runs it as SQL, so it is not a place to accept
  // a path.
  const file = resolve(__dirname, '..', 'migrations', basename(name));

  // Normalise CRLF to LF before handing the file to Postgres. core.autocrlf is
  // true in this repo, so a clean checkout on Windows yields CRLF on disk, and
  // whatever we send is what `pg_get_functiondef` gives back later. Several
  // migrations patch an existing function by reading its definition, asserting a
  // multi-line needle appears exactly once, and replacing it — 20260816194056 and
  // 20260816213000 do this twenty-five times between them. A CRLF needle cannot
  // match an LF body, so those migrations refuse with "... source contract
  // drifted" depending purely on the line endings of whoever applied the
  // prerequisite. Normalising here keeps stored bodies identical regardless of
  // checkout, and is pure whitespace: no migration carries a lone CR.
  const sql = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');

  await loadEnvFile();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: [server] } = await client.query('show server_version');
    console.log(`Connected — Postgres ${server.server_version}`);
    console.log(`Migration: ${basename(file)} (${sql.split(/\r?\n/).length} lines)`);

    if (checkOnly) {
      console.log('\n--check: connected and read the file. Nothing was run.');
      return;
    }

    await client.query("set lock_timeout = '5s'");
    await client.query("set statement_timeout = '60s'");

    const startedAt = Date.now();
    await client.query(sql);
    console.log(`\nApplied in ${Date.now() - startedAt}ms.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nMigration failed — nothing was committed if the file is transactional:');
  console.error(error?.message ?? error);
  process.exit(1);
});
