// One-off RLS verification script — NOT part of the app, safe to delete after use.
// Connects as the Postgres superuser (bypasses RLS by default), creates an isolated
// "account B" + job to test against, then SETs ROLE authenticated and impersonates
// the real test user (account A) via request.jwt.claim.sub to prove:
//   1. is_member()/is_owner() no longer infinitely recurse (the fix from this session)
//   2. A user can read/write jobs+costs scoped to their OWN account
//   3. A user CANNOT read or write another account's jobs/costs (RLS isolation)
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  const filePath = resolve(__dirname, '..', '.env.local');
  const contents = await readFile(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

async function main() {
  await loadEnvFile();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const USER_A = '6dfed83a-fe8d-4a31-a3cb-25b44c821688'; // existing real test user

  try {
    // ---- Setup (as superuser, bypasses RLS) ----------------------------
    const { rows: memA } = await client.query(
      `select account_id from memberships where user_id = $1`,
      [USER_A]
    );
    if (memA.length === 0) throw new Error('Test user has no membership — run auth flow first.');
    const accountA = memA[0].account_id;

    const { rows: accB } = await client.query(
      `insert into accounts (business_name) values ('RLS Test Co B') returning id`
    );
    const accountB = accB[0].id;

    const { rows: jobB } = await client.query(
      `insert into jobs (account_id, ref, client_name, quoted_amount) values ($1, 'J-TESTB', 'Other Contractor Client', 5000) returning id`,
      [accountB]
    );

    const { rows: jobA } = await client.query(
      `insert into jobs (account_id, ref, client_name, quoted_amount) values ($1, 'J-TESTA', 'RLS Probe Client', 10000) returning id`,
      [accountA]
    );

    console.log('Setup OK. accountA=%s accountB=%s jobA=%s jobB=%s', accountA, accountB, jobA[0].id, jobB[0].id);

    // ---- Impersonate USER_A as the "authenticated" role -----------------
    await client.query('begin');
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claim.sub', $1::text, true)`, [USER_A]);
    await client.query(`select set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify({ sub: USER_A }),
    ]);

    // 1. No infinite recursion — this alone proves the SECURITY DEFINER fix works.
    const { rows: isMemberRows } = await client.query(`select is_member($1) as ok`, [accountA]);
    console.log('is_member(accountA) recursion check:', isMemberRows[0].ok === true ? 'PASS (no recursion)' : 'FAIL');

    // 2. Can read own account's jobs.
    const { rows: ownJobs } = await client.query(`select ref from jobs where account_id = $1`, [accountA]);
    console.log(
      'Read own jobs:',
      ownJobs.some((j) => j.ref === 'J-TESTA') ? 'PASS' : 'FAIL',
      ownJobs.map((j) => j.ref)
    );

    // 3. Cannot read the OTHER account's jobs (RLS filters it out entirely).
    const { rows: otherJobs } = await client.query(`select ref from jobs where account_id = $1`, [accountB]);
    console.log('Read other account jobs (should be empty):', otherJobs.length === 0 ? 'PASS' : 'FAIL', otherJobs);

    // 4. Cannot INSERT a job into the other account (RLS should reject).
    let blockedInsert = false;
    try {
      await client.query('savepoint sp1');
      await client.query(
        `insert into jobs (account_id, ref, client_name, quoted_amount) values ($1, 'J-HACK', 'Should be blocked', 1) `,
        [accountB]
      );
    } catch (err) {
      blockedInsert = true;
      await client.query('rollback to savepoint sp1');
    }
    console.log('Insert into other account blocked by RLS:', blockedInsert ? 'PASS' : 'FAIL');

    // 5. Costs table isolation + labor amount semantics (app computes amount; here we just verify RLS on costs).
    await client.query(
      `insert into costs (account_id, job_id, type, category, description, amount) values ($1, $2, 'material', 'Materials', 'Test shingles', 500)`,
      [accountA, jobA[0].id]
    );
    const { rows: ownCosts } = await client.query(`select description from costs where job_id = $1`, [jobA[0].id]);
    console.log('Read own costs:', ownCosts.length === 1 ? 'PASS' : 'FAIL');

    let blockedCostInsert = false;
    try {
      await client.query('savepoint sp2');
      await client.query(
        `insert into costs (account_id, job_id, type, category, description, amount) values ($1, $2, 'material', 'Materials', 'Should be blocked', 999)`,
        [accountB, jobB[0].id]
      );
    } catch (err) {
      blockedCostInsert = true;
      await client.query('rollback to savepoint sp2');
    }
    console.log('Insert cost into other account blocked by RLS:', blockedCostInsert ? 'PASS' : 'FAIL');

    await client.query('rollback'); // undo the SET ROLE + impersonation transaction

    // ---- Cleanup (as superuser again) -----------------------------------
    await client.query(`delete from accounts where id = $1`, [accountB]); // cascades job/cost B
    await client.query(`delete from jobs where id = $1`, [jobA[0].id]); // cascades cost A
    console.log('Cleanup done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('RLS test failed:', err);
  process.exit(1);
});
