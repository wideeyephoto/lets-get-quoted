// READ-ONLY proof that the tenant boundary still holds, run as real users.
//
//   node scripts/verify-tenant-isolation.mjs
//   node scripts/verify-tenant-isolation.mjs clients leads jobs sites
//
// WHY THIS EXISTS. The office-capability work rewrites RLS policies on tables
// that hold one contractor's customers, and the failure mode is not an error --
// it is one business quietly seeing another's. A migration post-condition can
// only check the SHAPE of a policy: that it names is_owner, that its `with
// check` is explicit. It cannot check that the predicate still means what it
// meant, because that depends on how PostgreSQL combines every policy on the
// table, and permissive policies OR together.
//
// So this asks the database the question directly. It signs in as each owner the
// way PostgREST does -- `set local role authenticated` plus a jwt claims sub --
// counts what that session can actually SEE, and compares it against what that
// account actually OWNS, read separately as the service role.
//
// Run it after ANY migration that touches a policy. The split migration
// 20260820230000 is the first, and it passed: every owner saw exactly their own
// rows and was blind to the rest.
//
// Every statement is a SELECT, and each session runs inside a transaction that
// is rolled back. Nothing here writes.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const DEFAULT_TABLES = ['clients', 'leads', 'jobs'];
const tables = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TABLES;

// Table names are interpolated, so they must not be attacker-shaped. They come
// from argv here, which is a developer typing, but the identifier rule is cheap
// and means this can never be pointed somewhere unexpected.
for (const t of tables) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(t)) throw new Error(`Refusing unusual table name: ${t}`);
}

for (const fileName of ['.env.local', '.env']) {
  try {
    for (const line of (await readFile(resolve(root, fileName), 'utf8')).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      const key = trimmed.slice(0, at).trim();
      const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // A missing env file is not an error; the next may supply DATABASE_URL.
  }
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

let failures = 0;
let vacuous = 0;

try {
  const owners = (await client.query(
    `select user_id, account_id from public.memberships where role = 'owner' order by account_id`,
  )).rows;

  if (owners.length < 2) {
    console.log('Fewer than two owner accounts exist; isolation cannot be tested against a neighbour.');
    process.exit(1);
  }

  // Ground truth, read as the service role: what each account actually owns.
  const owns = new Map();
  for (const owner of owners) {
    const counts = {};
    for (const table of tables) {
      const { rows } = await client.query(
        `select count(*)::int as n from public.${table} where account_id = $1`, [owner.account_id],
      );
      counts[table] = rows[0].n;
    }
    owns.set(owner.account_id, counts);
  }

  const grandTotal = {};
  for (const table of tables) {
    grandTotal[table] = [...owns.values()].reduce((sum, counts) => sum + counts[table], 0);
  }

  console.log(`Reading ${tables.length} table(s) as ${owners.length} owner(s), under RLS.\n`);

  for (const owner of owners) {
    const mine = owns.get(owner.account_id);
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: owner.user_id, role: 'authenticated' }),
      ]);
      for (const table of tables) {
        const { rows } = await client.query(`select count(*)::int as n from public.${table}`);
        const seen = rows[0].n;
        const ok = seen === mine[table];
        if (!ok) failures += 1;
        console.log(
          `  ${owner.account_id.slice(0, 8)}  ${table.padEnd(14)} sees ${String(seen).padStart(4)}`
          + `  owns ${String(mine[table]).padStart(4)}  ${ok ? 'ok' : 'MISMATCH'}`,
        );
      }
    } finally {
      await client.query('rollback');
    }

    // An owner who happens to own every row would "pass" every check above
    // while proving nothing, so say when the comparison was vacuous rather than
    // letting it count as evidence.
    const elsewhere = tables.reduce((sum, t) => sum + (grandTotal[t] - mine[t]), 0);
    if (elsewhere === 0) {
      vacuous += 1;
      console.log('      no rows exist elsewhere, so isolation was not actually exercised here');
    } else {
      console.log(`      blind to ${elsewhere} row(s) held by other accounts`);
    }
  }
} finally {
  await client.end();
}

if (failures > 0) {
  console.log(`\n${failures} MISMATCH(ES). A session saw a different number of rows than its account owns.`);
  process.exit(1);
}
if (vacuous === 0) {
  console.log('\nEvery owner saw exactly their own rows and none of anybody else\'s.');
} else {
  console.log(`\nNo mismatches, but ${vacuous} account(s) had no neighbour rows to be blind to.`);
}
