import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

// The field app against REAL row-level security.
//
// WHY THIS EXISTS. Every field-app bug worth fixing in this app has had the
// same shape: correct-looking code, passing types, passing unit tests, and a
// database that quietly disagrees. The unit suite mocks the client, so it can
// only ever prove that the code does what the code says. It cannot see:
//
//   * a read of a table the caller holds no policy on, which returns NO ROW and
//     NO ERROR — so getTimeClockMode answered 'off' and an owner's REQUIRED
//     clocking silently became optional;
//   * a write that a trigger refuses, so the crew's first "Start work" raised
//     and the job never started;
//   * a policy that is broader than the UI, so the rate a crew member is paid
//     was a column they could write.
//
// So this suite opens a real Postgres connection, becomes the `authenticated`
// role with a crew member's JWT claims — which is what a deployed field-app
// session actually is — and asserts what that session can and cannot do.
//
// Run:  npx vitest run --config vitest.staging.config.ts
// Never runs in CI: vitest.config.ts's include is test/**, this lives in
// test-staging/**.
//
// EVERYTHING IS ROLLED BACK. The whole suite runs inside one transaction that
// is never committed, so staging is byte-identical afterwards.

const AUTH_INSTANCE = '00000000-0000-0000-0000-000000000000';

let db: Client;

const ids = {
  account: randomUUID(),
  ownerUser: randomUUID(),
  crewUser: randomUUID(),
  mateUser: randomUUID(),
  crew: randomUUID(),
  mate: randomUUID(),
  myJob: randomUUID(),
  theirJob: randomUUID(),
  myStop: randomUUID(),
  looseStop: randomUUID(),
  theirStop: randomUUID(),
};

/** Become a signed-in crew member: the role and the claims a session carries. */
async function asCrew(userId = ids.crewUser) {
  await db.query('set local role authenticated');
  await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}'`);
}

/** Back to the migration role, for fixture work RLS is not the subject of. */
async function asAdmin() {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claims', '', true)`);
}

/** Run something as a crew member and give back what the database said. */
async function crewQuery(sql: string, params: unknown[] = [], userId = ids.crewUser) {
  await asCrew(userId);
  try {
    const result = await db.query(sql, params as never[]);
    return { ok: true as const, rows: result.rows, count: result.rowCount ?? 0 };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  } finally {
    await asAdmin();
  }
}

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'These tests need .env.staging.local (DATABASE_URL) and the staging vitest config:\n' +
        '  npx vitest run --config vitest.staging.config.ts',
    );
  }
  if (/\bprod\b/i.test(connectionString)) {
    throw new Error('DATABASE_URL looks like production. This suite writes rows; point it at staging.');
  }

  db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();
  // One transaction for the whole suite, rolled back in afterAll. Nothing here
  // survives the run.
  await db.query('begin');

  const users = [ids.ownerUser, ids.crewUser, ids.mateUser];
  for (const id of users) {
    await db.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, $2, 'authenticated', 'authenticated', $3)
       on conflict (id) do nothing`,
      [id, AUTH_INSTANCE, `${id}@field-rls.test`],
    );
  }

  await db.query(`insert into accounts (id, business_name) values ($1, 'Field RLS Fixture')`, [ids.account]);
  // The clock is REQUIRED here on purpose: it is the setting the field app read
  // through the wrong client and resolved to 'off'.
  await db.query(`update accounts set time_clock_mode = 'required' where id = $1`, [ids.account]);

  await db.query(`insert into memberships (account_id, user_id, role) values ($1, $2, 'owner')`, [ids.account, ids.ownerUser]);
  await db.query(`insert into memberships (account_id, user_id, role) values ($1, $2, 'crew')`, [ids.account, ids.crewUser]);
  await db.query(`insert into memberships (account_id, user_id, role) values ($1, $2, 'crew')`, [ids.account, ids.mateUser]);

  await db.query(
    `insert into crew (id, account_id, name, phone, hourly_rate, user_id, email)
     values ($1, $2, 'Danny Field', '5550001', 32.50, $3, 'danny@field-rls.test')`,
    [ids.crew, ids.account, ids.crewUser],
  );
  await db.query(
    `insert into crew (id, account_id, name, phone, hourly_rate, user_id, email)
     values ($1, $2, 'Mike Mate', '5550002', 47.00, $3, 'mike@field-rls.test')`,
    [ids.mate, ids.account, ids.mateUser],
  );

  await db.query(
    `insert into jobs (id, account_id, ref, client_name, status, quoted_amount)
     values ($1, $2, 'J-RLS-1', 'Assigned Customer', 'new_lead', 4000)`,
    [ids.myJob, ids.account],
  );
  await db.query(
    `insert into jobs (id, account_id, ref, client_name, status, quoted_amount)
     values ($1, $2, 'J-RLS-2', 'Somebody Else', 'new_lead', 9000)`,
    [ids.theirJob, ids.account],
  );
  await db.query(`insert into crew_assignments (job_id, crew_id, account_id) values ($1, $2, $3)`, [
    ids.myJob,
    ids.crew,
    ids.account,
  ]);
  await db.query(`insert into crew_assignments (job_id, crew_id, account_id) values ($1, $2, $3)`, [
    ids.theirJob,
    ids.mate,
    ids.account,
  ]);

  const today = new Date().toISOString().slice(0, 10);
  await db.query(
    `insert into route_stops (id, account_id, crew_id, scheduled_for, label, kind, minutes)
     values ($1, $2, $3, $4, 'County dump', 'dump', 25)`,
    [ids.myStop, ids.account, ids.crew, today],
  );
  await db.query(
    `insert into route_stops (id, account_id, crew_id, scheduled_for, label, kind, minutes)
     values ($1, $2, null, $3, 'Supply house', 'supply', 20)`,
    [ids.looseStop, ids.account, today],
  );
  await db.query(
    `insert into route_stops (id, account_id, crew_id, scheduled_for, label, kind, minutes)
     values ($1, $2, $3, $4, 'Their fuel stop', 'fuel', 10)`,
    [ids.theirStop, ids.account, ids.mate, today],
  );
}, 60_000);

afterAll(async () => {
  if (!db) return;
  await db.query('rollback');
  await db.end();
});

describe('what a crew session can see', () => {
  it('reads the job it is assigned to, and no other', async () => {
    const mine = await crewQuery('select id from jobs where account_id = $1', [ids.account]);
    expect(mine.ok).toBe(true);
    expect(mine.ok && mine.rows.map((row) => row.id)).toEqual([ids.myJob]);
  });

  it('CANNOT read the accounts table — the bug that switched required clocking off', async () => {
    // The time clock setting lives here. A crew-scoped read returns zero rows
    // and NO error, so the helper that reads it answered 'off' and the manual
    // hours form came back on a screen where the owner had banned it. Anything
    // other than an empty result here means that class of bug is live again.
    const result = await crewQuery('select id, time_clock_mode from accounts where id = $1', [ids.account]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.count).toBe(0);
  });

  it('reads its own crew row but not a coworker\'s pay rate', async () => {
    const result = await crewQuery('select id, hourly_rate from crew where account_id = $1', [ids.account]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.rows.map((row) => row.id)).toEqual([ids.crew]);
  });

  it('sees its own stops and the day\'s unassigned ones, not another truck\'s', async () => {
    const result = await crewQuery('select id from route_stops where account_id = $1 order by label', [ids.account]);
    expect(result.ok).toBe(true);
    const seen = result.ok ? result.rows.map((row) => row.id) : [];
    expect(seen).toContain(ids.myStop);
    // The change: an unassigned dump run belongs to whoever is out that day.
    expect(seen).toContain(ids.looseStop);
    expect(seen).not.toContain(ids.theirStop);
  });
});

describe('changing a job status', () => {
  it('cannot update the jobs table directly at all', async () => {
    // job_crew_update is gone. Under RLS an UPDATE with no permitting policy
    // matches nothing rather than raising, so the assertion is on rows touched.
    const result = await crewQuery(`update jobs set status = 'complete' where id = $1`, [ids.myJob]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.count).toBe(0);
  });

  it('starts work through the function, stamping started_at', async () => {
    // The exact press that used to raise 'crew may only change job status'.
    const result = await crewQuery(`select * from crew_set_job_status($1, 'in_progress')`, [ids.myJob]);
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    expect(result.ok && result.rows[0].status).toBe('in_progress');
    expect(result.ok && result.rows[0].started_at).toBeTruthy();
  });

  it('never re-dates started_at on a second press', async () => {
    const first = await crewQuery('select started_at from jobs where id = $1', [ids.myJob]);
    const stamp = first.ok ? String(first.rows[0].started_at) : '';
    const again = await crewQuery(`select * from crew_set_job_status($1, 'complete')`, [ids.myJob]);
    expect(again.ok, again.ok ? '' : again.message).toBe(true);
    expect(again.ok && String(again.rows[0].started_at)).toBe(stamp);
    expect(again.ok && again.rows[0].status).toBe('complete');
  });

  it('refuses a job this crew member is not on', async () => {
    const result = await crewQuery(`select * from crew_set_job_status($1, 'in_progress')`, [ids.theirJob]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/not assigned/i);
  });

  it('refuses a status that is not one of the two the app offers', async () => {
    for (const status of ['archived', 'new_lead', 'deleted']) {
      const result = await crewQuery(`select * from crew_set_job_status($1, $2)`, [ids.myJob, status]);
      expect(result.ok, `status ${status} should be refused`).toBe(false);
    }
  });

  it('leaves the quoted amount untouched — the reason the grant was withdrawn', async () => {
    await asAdmin();
    const { rows } = await db.query('select quoted_amount, account_id from jobs where id = $1', [ids.myJob]);
    expect(Number(rows[0].quoted_amount)).toBe(4000);
    expect(rows[0].account_id).toBe(ids.account);
  });
});

describe('the clock, and what a crew member is paid for it', () => {
  const shift = randomUUID();

  it('pins the rate to the owner\'s number, whatever the insert asks for', async () => {
    const result = await crewQuery(
      `insert into time_entries (id, account_id, crew_id, job_id, rate)
       values ($1, $2, $3, $4, 999.00) returning rate, ended_at`,
      [shift, ids.account, ids.crew, ids.myJob],
    );
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    // 32.50 is what the owner set on the roster. 999 is what the request asked
    // for, and the request does not get a say.
    expect(result.ok && Number(result.rows[0].rate)).toBe(32.5);
    expect(result.ok && result.rows[0].ended_at).toBeNull();
  });

  it('refuses a shift opened on a job they are not assigned to', async () => {
    const result = await crewQuery(
      `insert into time_entries (account_id, crew_id, job_id, rate) values ($1, $2, $3, 32.50)`,
      [ids.account, ids.crew, ids.theirJob],
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a shift opened in somebody else\'s name', async () => {
    const result = await crewQuery(
      `insert into time_entries (account_id, crew_id, job_id, rate) values ($1, $2, $3, 47.00)`,
      [ids.account, ids.mate, ids.myJob],
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a rate rise applied to a running shift', async () => {
    const result = await crewQuery('update time_entries set rate = 500 where id = $1', [shift]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/may only close their own shift/i);
  });

  it('refuses backdating the start of a running shift', async () => {
    const result = await crewQuery(`update time_entries set started_at = now() - interval '6 hours' where id = $1`, [shift]);
    expect(result.ok).toBe(false);
  });

  it('refuses moving the hours onto another job', async () => {
    const result = await crewQuery('update time_entries set job_id = $1 where id = $2', [ids.theirJob, shift]);
    expect(result.ok).toBe(false);
  });

  it('refuses passing a guessed end time off as an owner-closed one', async () => {
    const result = await crewQuery('update time_entries set closed_by_owner = true, ended_at = now() where id = $1', [shift]);
    expect(result.ok).toBe(false);
  });

  it('allows exactly one thing: clocking out', async () => {
    const result = await crewQuery(
      `update time_entries set ended_at = now(), note = 'Ran the gable end' where id = $1 returning ended_at`,
      [shift],
    );
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    expect(result.ok && result.count).toBe(1);
  });

  it('and refuses to do it twice — a closed shift is a record, not a draft', async () => {
    const result = await crewQuery('update time_entries set ended_at = now() where id = $1', [shift]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/already closed/i);
  });
});

describe('labor costs', () => {
  it('refuses a rate the owner never set', async () => {
    const result = await crewQuery(
      `insert into costs (account_id, job_id, type, category, description, crew_id, hours, rate, amount)
       values ($1, $2, 'labor', 'Labor', 'Four hours', $3, 4, 200.00, 800.00)`,
      [ids.account, ids.myJob, ids.crew],
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/may not set their own pay rate/i);
  });

  it('refuses an amount that is not hours times the rate', async () => {
    const result = await crewQuery(
      `insert into costs (account_id, job_id, type, category, description, crew_id, hours, rate, amount)
       values ($1, $2, 'labor', 'Labor', 'Creative arithmetic', $3, 4, 32.50, 9000.00)`,
      [ids.account, ids.myJob, ids.crew],
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/hours x the rate/i);
  });

  it('accepts the honest one', async () => {
    const result = await crewQuery(
      `insert into costs (account_id, job_id, type, category, description, crew_id, hours, rate, amount)
       values ($1, $2, 'labor', 'Labor', 'Four hours', $3, 4, 32.50, 130.00) returning amount`,
      [ids.account, ids.myJob, ids.crew],
    );
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    expect(result.ok && Number(result.rows[0].amount)).toBe(130);
  });

  it('accepts a rate snapshotted at clock-in after the owner changes it', async () => {
    // The case that would otherwise make clocking out fail: the shift opened at
    // 32.50 and the owner raised the roster to 40 during the afternoon.
    await asAdmin();
    await db.query('update crew set hourly_rate = 40.00 where id = $1', [ids.crew]);

    const result = await crewQuery(
      `insert into costs (account_id, job_id, type, category, description, crew_id, hours, rate, amount)
       values ($1, $2, 'labor', 'Labor', 'Shift that spanned the change', $3, 2, 32.50, 65.00) returning rate`,
      [ids.account, ids.myJob, ids.crew],
    );
    expect(result.ok, result.ok ? '' : result.message).toBe(true);

    await asAdmin();
    await db.query('update crew set hourly_rate = 32.50 where id = $1', [ids.crew]);
  });

  it('leaves a material cost alone — hours and rates are not its business', async () => {
    const result = await crewQuery(
      `insert into costs (account_id, job_id, type, category, description, crew_id, amount)
       values ($1, $2, 'material', 'Materials', '2 bundles shingles', $3, 84.00)`,
      [ids.account, ids.myJob, ids.crew],
    );
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
  });
});

describe('offline replay cannot double-bill', () => {
  it('refuses the same submission key twice', async () => {
    await asAdmin();
    const key = `queue-${randomUUID()}`;
    await db.query(`insert into field_submissions (account_id, crew_id, key, kind) values ($1, $2, $3, 'clock-out')`, [
      ids.account,
      ids.crew,
      key,
    ]);
    await expect(
      db.query(`insert into field_submissions (account_id, crew_id, key, kind) values ($1, $2, $3, 'clock-out')`, [
        ids.account,
        ids.crew,
        key,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('and crew hold no policy on that ledger, so they cannot pre-claim their own', async () => {
    const result = await crewQuery(
      `insert into field_submissions (account_id, crew_id, key, kind) values ($1, $2, 'forged', 'note')`,
      [ids.account, ids.crew],
    );
    expect(result.ok).toBe(false);
  });
});

describe('revoking field-app access', () => {
  it('ends the session\'s reach the moment the membership goes', async () => {
    // What revokeCrewAccess does: stamp the row, clear user_id, drop the crew
    // membership. is_crew()/crew_on_job() both stop matching, so every field
    // read empties out — which is what "revoked" has to mean at the database,
    // not merely a flag the application promises to check.
    await asAdmin();
    await db.query(`update crew set access_revoked_at = now(), user_id = null where id = $1`, [ids.crew]);
    await db.query(`delete from memberships where account_id = $1 and user_id = $2 and role = 'crew'`, [
      ids.account,
      ids.crewUser,
    ]);

    const jobs = await crewQuery('select id from jobs where account_id = $1', [ids.account]);
    expect(jobs.ok).toBe(true);
    expect(jobs.ok && jobs.count).toBe(0);

    const stops = await crewQuery('select id from route_stops where account_id = $1', [ids.account]);
    expect(stops.ok && stops.count).toBe(0);

    const status = await crewQuery(`select * from crew_set_job_status($1, 'in_progress')`, [ids.myJob]);
    expect(status.ok).toBe(false);
  });
});
