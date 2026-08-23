import { describe, it, expect, beforeEach, vi } from 'vitest';

// What actually went out, and what was recorded about it.
const sentSms: { phone: string; message: string }[] = [];
const sentEmail: { to: string; count: number; overdue: boolean }[] = [];
const feedEvents: { kind: string; title: string; meta: Record<string, unknown> }[] = [];
const smsResult: { value: string | null; throws: string | null } = { value: 'SM123', throws: null };
const emailResult: { throws: string | null } = { throws: null };

vi.mock('@/lib/sms', () => ({
  sendSelectionRequestSms: vi.fn(async ({ phone, message }: { phone: string; message: string }) => {
    if (smsResult.throws) throw new Error(smsResult.throws);
    sentSms.push({ phone, message });
    return smsResult.value;
  }),
}));

vi.mock('@/lib/email', () => ({
  sendSelectionRequestEmail: vi.fn(async (input: { recipientEmail: string; count: number; overdue: boolean }) => {
    if (emailResult.throws) throw new Error(emailResult.throws);
    sentEmail.push({ to: input.recipientEmail, count: input.count, overdue: input.overdue });
  }),
}));

vi.mock('@/lib/job-feed', () => ({
  createClientJobAccessToken: vi.fn(async () => 'tok_abc'),
  createJobFeedEvent: vi.fn(async (_c: unknown, _a: string, _j: string, input: Record<string, unknown>) => {
    feedEvents.push(input as never);
  }),
}));

// The sweep reaches for createAdminClient only when no client is injected, but
// the import is evaluated either way and lib/auth pulls in next/headers.
vi.mock('@/lib/auth', () => ({ createAdminClient: () => { throw new Error('the test must inject a client'); } }));

const { runChoiceReminderSweep } = await import('@/lib/choice-reminder-sweep');

const ACCOUNT = 'acc-1';
const JOB = 'job-1';
type Row = Record<string, unknown>;

/**
 * A fake PostgREST client, only as clever as these tests need.
 *
 * It has to do one thing properly that the other fakes in this suite do not:
 * enforce the UNIQUE INDEX on selection_reminders. That constraint is the entire
 * idempotency guarantee — the sweep claims a send by inserting a row and reads a
 * 23505 as "somebody already has this one" — so a fake that accepts every insert
 * would let a duplicate-sending sweep pass its own duplicate test.
 */
function fakeDb(options: {
  accounts?: Row[];
  selections?: Row[];
  options_?: Row[];
  jobs?: Row[];
  /** Applied to every phone number that appears on a job. */
  consent?: 'opted_in' | 'opted_out' | null;
  reminders?: Row[];
  /** Make the settings columns unreadable, to fake a pre-migration DB. */
  missingAccountColumns?: boolean;
} = {}) {
  const reminders: Row[] = [...(options.reminders ?? [])];
  let nextId = 1;

  // Every fixture row gets account_id and the enabled flag unless it says
  // otherwise, because the real queries filter on both and a fixture missing
  // them fails in a way that looks like a bug in the sweep.
  const owned = (rows: Row[]): Row[] => rows.map((row) => ({ account_id: ACCOUNT, ...row }));
  const jobs = owned(options.jobs ?? []);

  const rowsFor = (table: string): Row[] => {
    if (table === 'accounts') {
      return owned(options.accounts ?? [{ id: ACCOUNT, timezone: 'America/New_York' }]).map((row) => ({
        selection_reminders_enabled: true,
        business_name: 'BrokePipes',
        ...row,
      }));
    }
    if (table === 'job_selections') return owned(options.selections ?? []);
    if (table === 'selection_options') return owned(options.options_ ?? []);
    if (table === 'jobs') return jobs;
    if (table === 'sms_consent') {
      if (!options.consent) return [];
      return jobs
        .filter((job) => job.client_phone)
        .map((job) => ({ account_id: job.account_id, phone_number: job.client_phone, status: options.consent }));
    }
    if (table === 'sites') return owned([{ company_name: 'BrokePipes' }]);
    if (table === 'selection_reminders') return reminders;
    return [];
  };

  const uniqueKey = (row: Row) =>
    row.selection_id
      ? `c|${row.account_id}|${row.selection_id}|${row.needed_by}|${row.stage}`
      : `j|${row.account_id}|${row.job_id}|${row.needed_by}|${row.stage}`;

  function chain(table: string, op: 'select' | 'insert' | 'update', values?: Row, columns?: string) {
    const filters: { column: string; value: unknown; kind: 'eq' | 'in' | 'is' }[] = [];
    const self: Record<string, unknown> = {};
    // Only the settings read asks for the columns a pre-migration database does
    // not have, so this is how the fake knows which select to reject.
    let wide = typeof columns === 'string' && columns.includes('selection_reminder_offsets');

    const matches = (row: Row) =>
      filters.every((filter) => {
        if (filter.kind === 'in') return (filter.value as unknown[]).includes(row[filter.column]);
        if (filter.kind === 'is') return (row[filter.column] ?? null) === null;
        return row[filter.column] === filter.value;
      });

    const resolve = () => {
      if (table === 'accounts' && op === 'select' && options.missingAccountColumns && wide) {
        return { data: null, error: { code: '42703', message: 'column does not exist' } };
      }
      if (op === 'insert') {
        const row = { id: `rem-${nextId++}`, ...(values ?? {}) };
        if (table === 'selection_reminders') {
          if (reminders.some((existing) => uniqueKey(existing) === uniqueKey(row))) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          reminders.push(row);
        }
        return { data: row, error: null };
      }
      if (op === 'update') {
        const hit = rowsFor(table).filter(matches);
        for (const row of hit) Object.assign(row, values);
        return { data: hit, error: null };
      }
      return { data: rowsFor(table).filter(matches), error: null };
    };

    for (const method of ['not', 'order', 'limit', 'gte', 'lte', 'neq']) self[method] = () => self;
    self.eq = (column: string, value: unknown) => { filters.push({ column, value, kind: 'eq' }); return self; };
    self.in = (column: string, value: unknown) => { filters.push({ column, value, kind: 'in' }); return self; };
    self.is = (column: string) => { filters.push({ column, value: null, kind: 'is' }); return self; };
    // .select() after an insert asks for the row back; after a select it is the
    // column list, which may arrive here rather than on from().select().
    self.select = (later?: string) => {
      if (typeof later === 'string' && later.includes('selection_reminder_offsets')) wide = true;
      return self;
    };
    self.maybeSingle = async () => {
      const out = resolve();
      if (out.error) return out;
      return { data: Array.isArray(out.data) ? out.data[0] ?? null : out.data, error: null };
    };
    self.then = (done: (value: unknown) => unknown) => done(resolve());
    return self;
  }

  return {
    reminders,
    from(table: string) {
      return {
        select: (columns?: string) => chain(table, 'select', undefined, columns),
        insert: (values: Row) => chain(table, 'insert', values),
        update: (values: Row) => chain(table, 'update', values),
      };
    },
  };
}

/** A board that is due its first reminder today, textable, on a live job. */
function due(
  overrides: {
    selections?: Row[];
    jobs?: Row[];
    consent?: 'opted_in' | 'opted_out' | null;
    reminders?: Row[];
  } = {},
) {
  return fakeDb({
    accounts: [{ id: ACCOUNT, timezone: 'America/New_York', selection_reminder_offsets: [0, 2], selection_reminder_hour: 9 }],
    selections: overrides.selections ?? [
      { id: 'sel-1', job_id: JOB, title: 'Patio tile', status: 'open', decide_by: '2026-08-10' },
      { id: 'sel-2', job_id: JOB, title: 'Kitchen faucet', status: 'open', decide_by: '2026-08-10' },
    ],
    options_: [{ selection_id: 'sel-1' }, { selection_id: 'sel-2' }],
    jobs: overrides.jobs ?? [
      { id: JOB, ref: 'J-1009', scope: 'Lawn & Order', client_name: 'Sarah Kim', client_phone: '+13135550123', client_email: 'sarah@example.com', status: 'in_progress' },
    ],
    consent: overrides.consent === undefined ? 'opted_in' : overrides.consent,
    reminders: overrides.reminders,
  });
}

// 09:30 in New York.
const NOW = new Date('2026-08-10T13:30:00.000Z');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (db: ReturnType<typeof fakeDb>, now = NOW) => runChoiceReminderSweep(now, db as any);

beforeEach(() => {
  sentSms.length = 0;
  sentEmail.length = 0;
  feedEvents.length = 0;
  smsResult.value = 'SM123';
  smsResult.throws = null;
  emailResult.throws = null;
});

describe('the sweep sends', () => {
  it('one text covering every choice due on the job', () => {
    const db = due();
    return run(db).then((summary) => {
      expect(summary.sent).toBe(1);
      expect(sentSms).toHaveLength(1);
      expect(sentSms[0].message).toContain('2 choices due today');
      expect(sentSms[0].message).toContain('• Patio tile');
      expect(sentSms[0].message).toContain('• Kitchen faucet');
      expect(sentSms[0].message).toContain('Reply STOP to opt out.');
    });
  });

  it('and records the stage, the channel and the time on the ledger', async () => {
    const db = due();
    await run(db);
    expect(db.reminders).toHaveLength(1);
    expect(db.reminders[0]).toMatchObject({
      account_id: ACCOUNT,
      job_id: JOB,
      needed_by: '2026-08-10',
      stage: 0,
      due_on: '2026-08-10',
      status: 'sent',
      channel: 'sms',
    });
    expect(db.reminders[0].sent_at).toBeTruthy();
    expect(db.reminders[0].selection_ids).toEqual(['sel-1', 'sel-2']);
  });

  it('and writes it to the job history', async () => {
    await run(due());
    expect(feedEvents).toHaveLength(1);
    expect(feedEvents[0].kind).toBe('selection_requested');
    expect(feedEvents[0].title).toBe('Choice reminder queued');
    expect(feedEvents[0].meta).toMatchObject({
      channel: 'sms',
      count: 2,
      reminder: true,
      stages: [0],
      delivery_state: 'queued',
    });
  });

  it('the second reminder two days later, and not the day between', async () => {
    const between = due({ reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'sent', attempts: 1 }] });
    expect((await run(between, new Date('2026-08-11T13:30:00.000Z'))).sent).toBe(0);

    const later = due({ reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'sent', attempts: 1 }] });
    const summary = await run(later, new Date('2026-08-12T13:30:00.000Z'));
    expect(summary.sent).toBe(1);
    expect(sentSms[0].message).toContain('now 2 days overdue');
    expect(later.reminders.at(-1)).toMatchObject({ stage: 1, needed_by: '2026-08-10' });
  });

  it('one message per job, never one thread for two jobs', async () => {
    const db = fakeDb({
      accounts: [{ id: ACCOUNT, timezone: 'America/New_York', selection_reminder_offsets: [0, 2], selection_reminder_hour: 9 }],
      selections: [
        { id: 'a', job_id: 'job-1', title: 'Patio tile', status: 'open', decide_by: '2026-08-10' },
        { id: 'b', job_id: 'job-2', title: 'Roof vent', status: 'open', decide_by: '2026-08-10' },
      ],
      options_: [{ selection_id: 'a' }, { selection_id: 'b' }],
      jobs: [
        { id: 'job-1', account_id: ACCOUNT, ref: 'J-1', scope: 'Kitchen', client_name: 'Sarah', client_phone: '+13135550123', client_email: null, status: 'in_progress' },
        { id: 'job-2', account_id: ACCOUNT, ref: 'J-2', scope: 'Roof', client_name: 'Dan', client_phone: '+13135550124', client_email: null, status: 'in_progress' },
      ],
      consent: 'opted_in',
    });
    const summary = await run(db);
    expect(summary.sent).toBe(2);
    expect(sentSms).toHaveLength(2);
    expect(sentSms[0].message).toContain('Kitchen');
    expect(sentSms[1].message).toContain('Roof');
  });
});

describe('the sweep stops', () => {
  it('when the automation is switched off', async () => {
    // The enabled filter is the query itself: an account that is off is never
    // returned, so nothing about it is even considered.
    const db = fakeDb({ accounts: [] });
    expect(await run(db)).toMatchObject({ sent: 0, reason: 'no accounts enabled' });
  });

  it('when every choice has been submitted', async () => {
    const db = due({ selections: [{ id: 'sel-1', job_id: JOB, title: 'Patio tile', status: 'chosen', decide_by: '2026-08-10' }] });
    expect((await run(db)).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
    expect(db.reminders).toHaveLength(0);
  });

  it('when a choice was cancelled', async () => {
    const db = due({ selections: [{ id: 'sel-1', job_id: JOB, title: 'Patio tile', status: 'cancelled', decide_by: '2026-08-10' }] });
    expect((await run(db)).sent).toBe(0);
  });

  it('when the needed-by date has been removed', async () => {
    const db = due({ selections: [{ id: 'sel-1', job_id: JOB, title: 'Patio tile', status: 'open', decide_by: null }] });
    expect((await run(db)).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });

  it('when the job is completed, and when it is cancelled', async () => {
    for (const status of ['complete', 'archived']) {
      sentSms.length = 0;
      const db = due({ jobs: [{ id: JOB, account_id: ACCOUNT, ref: 'J-1009', scope: 'Lawn & Order', client_name: 'Sarah', client_phone: '+13135550123', client_email: 'sarah@example.com', status }] });
      expect((await run(db)).sent, status).toBe(0);
      expect(sentSms, status).toHaveLength(0);
      // Nothing is even claimed, so re-opening the job later starts clean.
      expect(db.reminders, status).toHaveLength(0);
    }
  });

  it('when the customer has opted out — without quietly emailing them instead', async () => {
    // STOP is a request to be left alone by this automation, not an instruction
    // to try the other channel. This job has an email address on it.
    const db = due({ consent: 'opted_out' });
    const summary = await run(db);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(sentSms).toHaveLength(0);
    expect(sentEmail).toHaveLength(0);
    expect(db.reminders[0]).toMatchObject({ status: 'skipped', failure_reason: 'opted_out' });
  });

  it('and records why, when there is nowhere at all to send', async () => {
    const db = due({
      consent: null,
      jobs: [{ id: JOB, account_id: ACCOUNT, ref: 'J-1009', scope: 'Lawn & Order', client_name: 'Sarah', client_phone: null, client_email: null, status: 'in_progress' }],
    });
    await run(db);
    expect(db.reminders[0]).toMatchObject({ status: 'skipped', failure_reason: 'no_contact' });
  });
});

describe('consent and the fallback', () => {
  it('emails somebody who never opted in to texts', async () => {
    // The fallback that already existed, and the case that is NOT an opt-out:
    // no consent row means they were always going to be emailed.
    const db = due({ consent: null });
    expect((await run(db)).sent).toBe(1);
    expect(sentSms).toHaveLength(0);
    expect(sentEmail).toEqual([{ to: 'sarah@example.com', count: 2, overdue: false }]);
    expect(db.reminders[0]).toMatchObject({ status: 'sent', channel: 'email' });
  });

  it('treats a STOP that lands mid-send as a skip, not a send', async () => {
    // sendSelectionRequestSms returns null when the number opted out between the
    // consent read and the send. The old code stamped the row regardless of what
    // came back, so the contractor was told a customer had been texted.
    smsResult.value = null;
    const db = due();
    const summary = await run(db);
    expect(summary.sent).toBe(0);
    expect(db.reminders[0]).toMatchObject({ status: 'skipped', failure_reason: 'opted_out' });
    expect(feedEvents).toHaveLength(0);
  });
});

describe('the sending window', () => {
  it("sends nothing outside the account's own hour", async () => {
    // 06:30 in New York, and the account sends at 9.
    const db = due();
    expect(await run(db, new Date('2026-08-10T10:30:00.000Z')))
      .toMatchObject({ sent: 0, reason: 'no account is due this hour' });
  });

  it('gives each account its own hour in the same run', async () => {
    // 13:30Z is 09:30 in New York and 06:30 in Los Angeles. One is due, one is
    // not — which is the entire reason the hour is resolved per account rather
    // than taken from the cron expression.
    const db = fakeDb({
      accounts: [
        { id: 'east', timezone: 'America/New_York', selection_reminder_offsets: [0, 2], selection_reminder_hour: 9 },
        { id: 'west', timezone: 'America/Los_Angeles', selection_reminder_offsets: [0, 2], selection_reminder_hour: 9 },
      ],
      selections: [
        { id: 'a', account_id: 'east', job_id: 'job-e', title: 'Tile', status: 'open', decide_by: '2026-08-10' },
        { id: 'b', account_id: 'west', job_id: 'job-w', title: 'Tile', status: 'open', decide_by: '2026-08-10' },
      ],
      options_: [{ account_id: 'east', selection_id: 'a' }, { account_id: 'west', selection_id: 'b' }],
      jobs: [
        { id: 'job-e', account_id: 'east', ref: 'J-E', scope: 'East', client_name: 'Sarah', client_phone: '+13135550123', client_email: null, status: 'in_progress' },
        { id: 'job-w', account_id: 'west', ref: 'J-W', scope: 'West', client_name: 'Dan', client_phone: '+13135550124', client_email: null, status: 'in_progress' },
      ],
      consent: 'opted_in',
    });
    const summary = await run(db);
    expect(summary.accounts).toBe(2);
    expect(summary.sent).toBe(1);
    expect(sentSms[0].message).toContain('East');
  });

  it('still catches up on a late run', async () => {
    // 11:30 in New York, two hours after the 9am window opened.
    const db = due();
    expect((await run(db, new Date('2026-08-10T15:30:00.000Z'))).sent).toBe(1);
  });
});

describe('idempotency', () => {
  it('sends once however many times the cron fires', async () => {
    const db = due();
    await run(db);
    await run(db);
    await run(db);
    expect(sentSms).toHaveLength(1);
    expect(db.reminders).toHaveLength(1);
  });

  it('sends once even when the previous run crashed after claiming', async () => {
    // A row left `pending` by a run that died between the claim and the send.
    // Within the stall window it stays claimed — a duplicate text is worse than
    // a late one.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'pending', attempts: 1, updated_at: NOW.toISOString() }],
    });
    expect((await run(db)).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });

  it('but rescues a claim that was abandoned long enough ago', async () => {
    // Past the stall window the claim is assumed dead. Without this, a deploy
    // mid-sweep would silently cost that homeowner their reminder entirely —
    // never sent and never retried, which is the one failure a claim-first
    // design can introduce and worse than the duplicate it prevents.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'pending', attempts: 1, updated_at: new Date(NOW.getTime() - 60 * 60_000).toISOString() }],
    });
    expect((await run(db)).sent).toBe(1);
    expect(sentSms).toHaveLength(1);
    expect(db.reminders).toHaveLength(1);
  });

  it('re-claims a stage a date change cancelled, once the date comes back', async () => {
    // resyncChoiceReminders parks a pending row at 'cancelled' when its
    // needed-by date is cleared. If that date is later put back, the stage is
    // genuinely owed again — and the unique index would otherwise keep
    // returning 23505 against a row nothing could revive, silently costing the
    // customer that reminder for good.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'cancelled', attempts: 1, failure_reason: 'needed_by_changed' }],
    });
    expect((await run(db)).sent).toBe(1);
    expect(sentSms).toHaveLength(1);
    expect(db.reminders).toHaveLength(1);
    expect(db.reminders[0]).toMatchObject({ status: 'sent', attempts: 2, failure_reason: null });
  });

  it('holds the claim against a second run racing to rescue the same stalled row', async () => {
    // The re-take compares `attempts` as well as `status`, and that is what
    // makes it a compare-and-swap. Guarding on status alone is not one when the
    // status being written IS the status being compared: under READ COMMITTED
    // the second updater re-checks against the row the first just wrote, still
    // sees 'pending', and both come away believing they own the claim.
    const stalled = { id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'pending', attempts: 1, updated_at: new Date(NOW.getTime() - 60 * 60_000).toISOString() };
    const db = due({ reminders: [stalled] });

    // First run rescues it and sends.
    expect((await run(db)).sent).toBe(1);
    expect(db.reminders[0].attempts).toBe(2);

    // A second run arriving behind it finds a row whose attempts have moved on.
    sentSms.length = 0;
    expect((await run(db)).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });

  it('never re-sends a reminder that already went', async () => {
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'sent', attempts: 1, sent_at: NOW.toISOString() }],
    });
    expect((await run(db)).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });
});

describe('failure and retry', () => {
  it("records the provider's own words rather than falling silent", async () => {
    smsResult.throws = 'Twilio 21610: unsubscribed recipient';
    const db = due();
    const summary = await run(db);
    expect(summary.failed).toBe(1);
    expect(db.reminders[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(String(db.reminders[0].failure_reason)).toContain('21610');
    // A failed send must not look like a delivered one anywhere.
    expect(feedEvents).toHaveLength(0);
    expect(db.reminders[0].sent_at).toBeFalsy();
  });

  it('retries a failure later the same day', async () => {
    smsResult.throws = 'network blip';
    const db = due();
    await run(db);
    expect(db.reminders[0].status).toBe('failed');

    smsResult.throws = null;
    sentSms.length = 0;
    expect((await run(db, new Date('2026-08-10T15:30:00.000Z'))).sent).toBe(1);
    expect(sentSms).toHaveLength(1);
    expect(db.reminders).toHaveLength(1);
    expect(db.reminders[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('gives up after three attempts rather than retrying forever', async () => {
    smsResult.throws = 'still broken';
    const db = due();
    await run(db);
    await run(db, new Date('2026-08-10T14:30:00.000Z'));
    await run(db, new Date('2026-08-10T15:30:00.000Z'));
    expect(db.reminders[0].attempts).toBe(3);

    smsResult.throws = null;
    sentSms.length = 0;
    expect((await run(db, new Date('2026-08-10T16:00:00.000Z'))).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });

  it("retries yesterday's failure while that stage is still the one owed", async () => {
    // A customer who was never told is the thing to fix. On the 11th, stage 0 is
    // still what a needed-by date of the 10th owes — stage 1 is not due until
    // the 12th — so the failed row is retried and the message finally lands,
    // saying honestly that they are a day late.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'failed', attempts: 1 }],
    });
    expect((await run(db, new Date('2026-08-11T13:30:00.000Z'))).sent).toBe(1);
    expect(sentSms[0].message).toContain('due yesterday');
    expect(db.reminders).toHaveLength(1);
  });

  it('stops retrying once that stage is no longer what is owed', async () => {
    // By the 12th the schedule has moved on to stage 1. The old stage-0 failure
    // is never asked about again — the PLAN is what bounds the retry, not a date
    // comparison inside the claim.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'failed', attempts: 1 }],
    });
    expect((await run(db, new Date('2026-08-12T13:30:00.000Z'))).sent).toBe(1);
    expect(db.reminders).toHaveLength(2);
    expect(db.reminders[0]).toMatchObject({ stage: 0, status: 'failed', attempts: 1 });
    expect(db.reminders[1]).toMatchObject({ stage: 1, status: 'sent' });
  });

  it('and never at all once the whole schedule has run out', async () => {
    // Past the grace window nothing is planned, so nothing is claimed, retried
    // or sent. Without the tail bound, switching this automation on would text
    // every homeowner who ever had a deadline.
    const db = due({
      reminders: [{ id: 'r0', account_id: ACCOUNT, job_id: JOB, selection_id: null, needed_by: '2026-08-10', stage: 0, due_on: '2026-08-10', status: 'failed', attempts: 1 }],
    });
    expect((await run(db, new Date('2026-09-01T13:30:00.000Z'))).sent).toBe(0);
    expect(sentSms).toHaveLength(0);
  });
});

describe('a database that has not had the migration yet', () => {
  it('falls back to the defaults rather than throwing', async () => {
    // The settings columns arrived after the switch did. An account read that
    // rejects them must degrade to the shipped behaviour, not 500 the cron.
    const db = fakeDb({
      missingAccountColumns: true,
      accounts: [{ id: ACCOUNT, timezone: 'America/New_York' }],
      selections: [{ id: 'sel-1', job_id: JOB, title: 'Patio tile', status: 'open', decide_by: '2026-08-10' }],
      options_: [{ selection_id: 'sel-1' }],
      jobs: [{ id: JOB, account_id: ACCOUNT, ref: 'J-1009', scope: 'Lawn & Order', client_name: 'Sarah', client_phone: '+13135550123', client_email: null, status: 'in_progress' }],
      consent: 'opted_in',
    });
    const summary = await run(db);
    expect(summary.accounts).toBe(1);
    expect(summary.sent).toBe(1);
  });
});
