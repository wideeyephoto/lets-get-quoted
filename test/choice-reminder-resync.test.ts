import { describe, it, expect } from 'vitest';
import { lastSelectionSendAt, resyncChoiceReminders, updateSelection } from '@/lib/selections-data';

// Moving a needed-by date moves the reminders with it.
//
// The date IS the schedule for a choice, so changing or clearing it invalidates
// anything queued against the old one — and the window between the edit and the
// next hourly sweep is exactly when a homeowner would otherwise be chased about
// a deadline that no longer exists.
//
// Nothing did this before. The only writer of the old chase stamps only ever
// wrote now(); no code anywhere set either back to null, so a reopened choice
// with a past deadline could never be chased again, and a date pushed back a
// fortnight kept whatever had already been sent against the old one.

const ACCOUNT = 'acc-1';
const JOB = 'job-1';
type Row = Record<string, unknown>;

function fakeDb(seed: { selections?: Row[]; reminders?: Row[]; feed?: Row[] } = {}) {
  const selections: Row[] = [...(seed.selections ?? [])];
  const reminders: Row[] = [...(seed.reminders ?? [])];
  const feed: Row[] = [...(seed.feed ?? [])];

  const rowsFor = (table: string): Row[] => {
    if (table === 'job_selections') return selections;
    if (table === 'selection_reminders') return reminders;
    if (table === 'job_feed') return feed;
    return [];
  };

  function chain(table: string, op: 'select' | 'update', values?: Row) {
    const filters: { column: string; value: unknown; kind: 'eq' | 'in' | 'neq' }[] = [];
    const self: Record<string, unknown> = {};
    const matches = (row: Row) =>
      filters.every((filter) => {
        if (filter.kind === 'in') return (filter.value as unknown[]).includes(row[filter.column]);
        if (filter.kind === 'neq') return row[filter.column] !== filter.value;
        return row[filter.column] === filter.value;
      });

    let sort: { column: string; ascending: boolean } | null = null;

    const resolve = () => {
      let hit = rowsFor(table).filter(matches);
      if (op === 'update') for (const row of hit) Object.assign(row, values);
      if (sort) {
        const { column, ascending } = sort;
        // Sorted properly rather than no-opped: lastSelectionSendAt asks for the
        // newest feed row, and a fake that ignores the order would pass whatever
        // order the fixture happened to be written in.
        hit = [...hit].sort((a, b) =>
          (ascending ? 1 : -1) * String(a[column] ?? '').localeCompare(String(b[column] ?? '')),
        );
      }
      return { data: hit, error: null };
    };

    for (const method of ['not', 'limit', 'is']) self[method] = () => self;
    self.order = (column: string, opts?: { ascending?: boolean }) => {
      sort = { column, ascending: opts?.ascending !== false };
      return self;
    };
    self.eq = (column: string, value: unknown) => { filters.push({ column, value, kind: 'eq' }); return self; };
    self.in = (column: string, value: unknown) => { filters.push({ column, value, kind: 'in' }); return self; };
    self.neq = (column: string, value: unknown) => { filters.push({ column, value, kind: 'neq' }); return self; };
    self.select = () => self;
    self.maybeSingle = async () => ({ data: resolve().data[0] ?? null, error: null });
    self.then = (done: (value: unknown) => unknown) => done(resolve());
    return self;
  }

  return {
    selections,
    reminders,
    feed,
    from(table: string) {
      return {
        select: () => chain(table, 'select'),
        update: (values: Row) => chain(table, 'update', values),
      };
    },
  };
}

const ledger = (overrides: Row = {}): Row => ({
  id: 'rem-1',
  account_id: ACCOUNT,
  job_id: JOB,
  needed_by: '2026-08-10',
  stage: 0,
  status: 'pending',
  ...overrides,
});

const choice = (overrides: Row = {}): Row => ({
  id: 'sel-1',
  account_id: ACCOUNT,
  job_id: JOB,
  status: 'open',
  decide_by: '2026-08-10',
  ...overrides,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (db: ReturnType<typeof fakeDb>) => db as any;

describe('resyncChoiceReminders', () => {
  it('leaves a reminder alone while a choice still carries its date', async () => {
    const db = fakeDb({ selections: [choice()], reminders: [ledger()] });
    expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB)).toEqual({ cancelled: 0 });
    expect(db.reminders[0].status).toBe('pending');
  });

  it('cancels one queued against a date that has moved', async () => {
    const db = fakeDb({ selections: [choice({ decide_by: '2026-08-20' })], reminders: [ledger()] });
    expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB)).toEqual({ cancelled: 1 });
    expect(db.reminders[0]).toMatchObject({ status: 'cancelled', failure_reason: 'needed_by_changed' });
  });

  it('cancels one queued against a date that was cleared entirely', async () => {
    const db = fakeDb({ selections: [choice({ decide_by: null })], reminders: [ledger()] });
    expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB)).toEqual({ cancelled: 1 });
  });

  it('cancels one whose choice was submitted or taken off the table', async () => {
    for (const status of ['chosen', 'cancelled']) {
      const db = fakeDb({ selections: [choice({ status })], reminders: [ledger()] });
      expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB), status).toEqual({ cancelled: 1 });
    }
  });

  it('NEVER touches a reminder that was already sent', async () => {
    // A sent row is the record of a message a homeowner really received.
    // Rewriting it to match a new deadline would make the job feed lie about
    // what somebody was told, and about when.
    const db = fakeDb({
      selections: [choice({ decide_by: '2026-08-20' })],
      reminders: [ledger({ status: 'sent', channel: 'sms', sent_at: '2026-08-10T13:00:00.000Z' })],
    });
    expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB)).toEqual({ cancelled: 0 });
    expect(db.reminders[0]).toMatchObject({ status: 'sent', needed_by: '2026-08-10' });
  });

  it('keeps a date that another choice on the job still needs', async () => {
    // Two choices shared the 10th and one of them moved. The reminder is still
    // owed, because the other choice is still waiting on that date.
    const db = fakeDb({
      selections: [choice({ id: 'sel-1', decide_by: '2026-08-20' }), choice({ id: 'sel-2' })],
      reminders: [ledger()],
    });
    expect(await resyncChoiceReminders(asClient(db), ACCOUNT, JOB)).toEqual({ cancelled: 0 });
  });

  it('leaves other jobs alone', async () => {
    const db = fakeDb({
      selections: [choice({ decide_by: null })],
      reminders: [ledger(), ledger({ id: 'rem-2', job_id: 'job-2' })],
    });
    await resyncChoiceReminders(asClient(db), ACCOUNT, JOB);
    expect(db.reminders[1].status).toBe('pending');
  });
});

describe('when the board was last sent', () => {
  const feedRow = (overrides: Row = {}): Row => ({
    account_id: ACCOUNT,
    job_id: JOB,
    kind: 'selection_requested',
    created_at: '2026-08-10T13:00:00.000Z',
    ...overrides,
  });

  it('counts both senders — the contractor pressing send, and the reminder', async () => {
    // The board used to derive this from job_selections.chase_sent_at, which the
    // sweep no longer writes. Reading those columns now would report a board
    // that had been reminded about twice as never sent at all.
    const db = fakeDb({ feed: [feedRow(), feedRow({ created_at: '2026-08-12T13:00:00.000Z' })] });
    expect(await lastSelectionSendAt(asClient(db), ACCOUNT, JOB)).toBe('2026-08-12T13:00:00.000Z');
  });

  it('is null when nothing has ever gone out', async () => {
    expect(await lastSelectionSendAt(asClient(fakeDb()), ACCOUNT, JOB)).toBeNull();
  });

  it('ignores other kinds of event, and other jobs', async () => {
    const db = fakeDb({
      feed: [
        feedRow({ kind: 'appointment_reminder', created_at: '2026-08-20T13:00:00.000Z' }),
        feedRow({ job_id: 'job-2', created_at: '2026-08-21T13:00:00.000Z' }),
        feedRow({ created_at: '2026-08-10T13:00:00.000Z' }),
      ],
    });
    expect(await lastSelectionSendAt(asClient(db), ACCOUNT, JOB)).toBe('2026-08-10T13:00:00.000Z');
  });
});

describe('editing a choice', () => {
  it('resyncs the reminders when the needed-by date changes', async () => {
    const db = fakeDb({ selections: [choice()], reminders: [ledger()] });
    const result = await updateSelection(asClient(db), ACCOUNT, 'sel-1', { decideBy: '2026-08-20' });
    expect(result.ok).toBe(true);
    expect(db.selections[0].decide_by).toBe('2026-08-20');
    expect(db.reminders[0].status).toBe('cancelled');
  });

  it('resyncs when the date is cleared', async () => {
    const db = fakeDb({ selections: [choice()], reminders: [ledger()] });
    await updateSelection(asClient(db), ACCOUNT, 'sel-1', { decideBy: null });
    expect(db.selections[0].decide_by).toBeNull();
    expect(db.reminders[0].status).toBe('cancelled');
  });

  it('does not resync when the edit was not about the date', async () => {
    // Renaming a choice must not disturb a reminder that is correctly queued.
    const db = fakeDb({ selections: [choice()], reminders: [ledger()] });
    await updateSelection(asClient(db), ACCOUNT, 'sel-1', { title: 'Patio tile (revised)' });
    expect(db.reminders[0].status).toBe('pending');
  });

  it('does not resync when the date was re-saved unchanged', async () => {
    const db = fakeDb({ selections: [choice()], reminders: [ledger()] });
    await updateSelection(asClient(db), ACCOUNT, 'sel-1', { decideBy: '2026-08-10' });
    expect(db.reminders[0].status).toBe('pending');
  });

  it('still refuses to edit a choice somebody has already made', async () => {
    const db = fakeDb({ selections: [choice({ status: 'chosen' })], reminders: [ledger()] });
    const result = await updateSelection(asClient(db), ACCOUNT, 'sel-1', { decideBy: '2026-08-20' });
    expect(result.ok).toBe(false);
    expect(db.reminders[0].status).toBe('pending');
  });
});
