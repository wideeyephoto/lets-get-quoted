import { beforeEach, describe, expect, it, vi } from 'vitest';

// The orchestration: what actually happens when somebody taps "I'm on my way".
// The database and the SMS provider are faked so the branching — start vs
// revise, duplicate handling, delivery recording, what lands in the timeline —
// is asserted deterministically rather than by staring at a live account.

const smsOutcome = { value: { status: 'sent', sid: 'SM123' } as { status: string; sid?: string; error?: string } };
const sentMessages: string[] = [];
const feedEvents: Array<{ kind: string; title: string; body: string; author: string; meta: unknown }> = [];

vi.mock('@/lib/sms', () => ({
  sendArrivalSms: vi.fn(async ({ message }: { message: string }) => {
    sentMessages.push(message);
    return smsOutcome.value;
  }),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn(async (_c: unknown, _a: string, _j: string, input: Record<string, unknown>) => {
    feedEvents.push(input as never);
    return input;
  }),
}));

const { sendArrival, applyArrivalStatus, applyHomeownerReply } = await import('@/lib/arrival-send');

const ACCOUNT = 'acc-1';
const JOB = 'job-1';
const PERMS = { send: true, shareLocation: true, viewContact: true, reschedule: true };

type Row = Record<string, unknown>;

/**
 * A fake PostgREST client, only as clever as these tests need. It records every
 * write so assertions can look at what would have hit the database.
 */
function fakeDb(options: { active?: Row | null; account?: Row } = {}) {
  const writes: Array<{ table: string; op: 'insert' | 'update'; values: Row }> = [];
  let active = options.active ?? null;

  const job = {
    id: JOB, ref: 'JOB-1', client_name: 'Maria Alvarez', client_phone: '+13135550123',
    address: '12 Elm St', scope: 'Water heater', scheduled_for: '2026-08-03', scheduled_time: '14:00',
    lat: 42.5, lng: -83.1,
  };

  const rowFor = (table: string): Row | null => {
    if (table === 'jobs') return job;
    if (table === 'accounts') return { id: ACCOUNT, business_name: 'BrokePipes', timezone: 'America/New_York', ...options.account };
    if (table === 'sites') return { company_name: 'BrokePipes' };
    if (table === 'job_tracking') return active;
    return null;
  };

  const builder = (table: string, op: 'select' | 'insert' | 'update', values?: Row) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of ['eq', 'neq', 'not', 'in', 'is', 'order', 'limit', 'select']) chain[method] = self;
    chain.maybeSingle = async () => ({ data: op === 'select' ? rowFor(table) : null, error: null });
    chain.single = async () => ({ data: { id: 'track-new' }, error: null });
    chain.then = undefined;
    if (op !== 'select') {
      writes.push({ table, op, values: values ?? {} });
      if (table === 'job_tracking' && op === 'update' && active) active = { ...active, ...values };
      // An update chain is awaited directly, so it has to be thenable.
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
    }
    return chain;
  };

  return {
    writes,
    get active() { return active; },
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        insert: (values: Row) => builder(table, 'insert', values),
        update: (values: Row) => builder(table, 'update', values),
      };
    },
  } as never;
}

beforeEach(() => {
  sentMessages.length = 0;
  feedEvents.length = 0;
  smsOutcome.value = { status: 'sent', sid: 'SM123' };
});

describe('starting a trip', () => {
  it('texts the customer a window and a link, and records the delivery', async () => {
    const db = fakeDb();
    const result = await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny Fletcher' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
      now: new Date('2026-08-03T18:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('started');
    expect(result.windowLabel).toBe('2:15 PM to 2:45 PM');
    expect(sentMessages[0]).toContain('/track/');
    expect(sentMessages[0]).toContain('Reply STOP to opt out.');
    expect(sentMessages[0]).toContain('Danny');

    const receipt = db.writes.find((w) => w.table === 'job_tracking' && 'sms_status' in w.values);
    expect(receipt?.values.sms_status).toBe('sent');
    expect(receipt?.values.sms_sid).toBe('SM123');
  });

  it('writes a timeline entry that says whether the customer was reached', async () => {
    await sendArrival(fakeDb(), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 30, shareLocation: false, techLoc: null,
    });
    expect(feedEvents[0].title).toBe('On the way');
    expect(feedEvents[0].body).toContain('Customer texted.');
    expect(feedEvents[0].visibility).toBe('internal');
  });

  it('says plainly in the timeline when the text did NOT go out', async () => {
    // The visit is real either way; the timeline has to record that nobody was
    // told, or the office will believe the customer is expecting them.
    smsOutcome.value = { status: 'failed', error: 'boom' };
    await sendArrival(fakeDb(), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
    });
    expect(feedEvents[0].body).toContain('did NOT go through');
  });

  it('remembers the ETA that was picked, so next time it is pre-selected', async () => {
    const db = fakeDb();
    await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 45, shareLocation: false, techLoc: null,
    });
    const pref = db.writes.find((w) => w.table === 'accounts');
    expect(pref?.values.arrival_default_minutes).toBe(45);
  });

  it('does not rewrite the remembered ETA when it has not changed', async () => {
    const db = fakeDb({ account: { arrival_default_minutes: 15 } });
    await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
    });
    expect(db.writes.find((w) => w.table === 'accounts')).toBeUndefined();
  });

  it('refuses when the crew member has no permission to send', async () => {
    const result = await sendArrival(fakeDb(), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: { ...PERMS, send: false }, etaMinutes: 15, shareLocation: false, techLoc: null,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(sentMessages).toHaveLength(0);
  });

  it('never attaches a location the tech did not consent to', async () => {
    const db = fakeDb();
    await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: { lat: 42.5, lng: -83.1 },
    });
    const insert = db.writes.find((w) => w.op === 'insert');
    expect(insert?.values.share_location).toBe(false);
    expect(insert?.values.tech_lat).toBeNull();
  });

  it('blurs a shared location to street precision by default', async () => {
    const db = fakeDb();
    await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: true, techLoc: { lat: 42.512345, lng: -83.123456 },
    });
    const insert = db.writes.find((w) => w.op === 'insert');
    expect(insert?.values.share_location).toBe(true);
    expect(insert?.values.tech_lat).toBe(42.512);
    expect(insert?.values.location_expires_at).toBeTruthy();
  });

  it("won't share location when the account policy forbids it, whatever the tech ticked", async () => {
    const db = fakeDb({ account: { arrival_location_policy: 'off' } });
    await sendArrival(db, {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: true, techLoc: { lat: 42.5, lng: -83.1 },
    });
    expect(db.writes.find((w) => w.op === 'insert')?.values.share_location).toBe(false);
  });
});

describe('duplicate protection', () => {
  const justSent = {
    id: 'track-1', status: 'en_route', last_sent_at: new Date('2026-08-03T18:00:00Z').toISOString(),
    arrival_start: null, arrival_end: null, share_location: false, revision_count: 0,
  };

  it('swallows a double tap without sending anything', async () => {
    const result = await sendArrival(fakeDb({ active: justSent }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
      now: new Date('2026-08-03T18:00:30Z'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('duplicate');
    expect(sentMessages).toHaveLength(0);
  });

  it('asks for confirmation on a deliberate resend, then goes through as an UPDATE', async () => {
    const later = new Date('2026-08-03T18:20:00Z');
    const unconfirmed = await sendArrival(fakeDb({ active: justSent }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null, now: later,
    });
    expect(unconfirmed.ok).toBe(false);

    const confirmed = await sendArrival(fakeDb({ active: justSent }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
      confirmedResend: true, now: later,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.mode).toBe('revised');
  });

  it('sends the update with NO second link — the customer already has one', async () => {
    await sendArrival(fakeDb({ active: justSent }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 20, shareLocation: false, techLoc: null,
      confirmedResend: true, now: new Date('2026-08-03T18:20:00Z'),
    });
    expect(sentMessages[0]).not.toContain('/track/');
    expect(sentMessages[0]).toContain('Reply STOP to opt out.');
  });

  it('apologises instead of just restating when the original window has passed', async () => {
    const missed = {
      ...justSent,
      arrival_start: new Date('2026-08-03T18:10:00Z').toISOString(),
      arrival_end: new Date('2026-08-03T18:20:00Z').toISOString(),
    };
    await sendArrival(fakeDb({ active: missed }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
      confirmedResend: true, now: new Date('2026-08-03T18:40:00Z'),
    });
    expect(sentMessages[0]).toContain('running behind');
    expect(feedEvents[0].title).toBe('Running late — customer told');
  });

  it('treats a tap after ARRIVED as a brand new trip, not an edit', async () => {
    // They left and came back. That is a second visit, and it needs its own
    // link — not a rewrite of the one that already concluded.
    const arrived = { ...justSent, status: 'arrived' };
    const result = await sendArrival(fakeDb({ active: arrived }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, etaMinutes: 15, shareLocation: false, techLoc: null,
      now: new Date('2026-08-03T19:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe('started');
    expect(sentMessages[0]).toContain('/track/');
  });
});

describe('how the visit ended', () => {
  const live = {
    id: 'track-1', status: 'en_route', last_sent_at: null, arrival_start: null,
    arrival_end: null, share_location: true, revision_count: 0,
  };

  it('drops the location share in the same write that closes the trip', async () => {
    for (const status of ['arrived', 'no_access', 'rescheduled', 'cancelled'] as const) {
      const db = fakeDb({ active: live });
      await applyArrivalStatus(db, {
        accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
        permissions: PERMS, status,
      });
      const close = db.writes.find((w) => w.table === 'job_tracking' && w.values.status === status);
      expect(close?.values.share_location).toBe(false);
      expect(close?.values.location_expires_at).toBeNull();
    }
  });

  it('announces an arrival but stays quiet about the awkward outcomes unless asked', async () => {
    await applyArrivalStatus(fakeDb({ active: live }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, status: 'arrived',
    });
    expect(sentMessages).toHaveLength(1);

    sentMessages.length = 0;
    await applyArrivalStatus(fakeDb({ active: live }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, status: 'cancelled',
    });
    expect(sentMessages).toHaveLength(0);
  });

  it('texts a cancellation when the tech chooses to', async () => {
    await applyArrivalStatus(fakeDb({ active: live }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, status: 'cancelled', notify: true, note: 'Van broke down.',
    });
    expect(sentMessages[0]).toContain('cancelled');
    expect(sentMessages[0]).toContain('Van broke down.');
  });

  it('blocks rescheduling for a crew member without that permission', async () => {
    const result = await applyArrivalStatus(fakeDb({ active: live }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: { ...PERMS, reschedule: false }, status: 'rescheduled',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('says so rather than inventing a trip when none is running', async () => {
    const result = await applyArrivalStatus(fakeDb({ active: null }), {
      accountId: ACCOUNT, jobId: JOB, actor: { crewId: 'crew-1', name: 'Danny' },
      permissions: PERMS, status: 'arrived',
    });
    expect(result).toEqual({ ok: false, reason: 'no_active_trip' });
  });
});

describe('what the homeowner says back', () => {
  it('lands in the job timeline, flagged when the tech needs it before knocking', async () => {
    const db = fakeDb();
    const result = await applyHomeownerReply(db, {
      accountId: ACCOUNT, jobId: JOB, trackingId: 'track-1', replyId: 'gate_locked', customerName: 'Maria Alvarez',
    });
    expect(result.ok).toBe(true);
    expect(result.ack).toContain('gate is locked');
    expect(feedEvents[0].title).toContain('⚠');
    expect(feedEvents[0].author).toBe('Maria');
    expect(db.writes.find((w) => 'homeowner_note' in w.values)?.values.homeowner_note).toContain('Gate is locked');
  });

  it('does not shout about good news', async () => {
    await applyHomeownerReply(fakeDb(), {
      accountId: ACCOUNT, jobId: JOB, trackingId: 'track-1', replyId: 'ready', customerName: 'Maria',
    });
    expect(feedEvents[0].title).not.toContain('⚠');
  });

  it('rejects anything that is not one of ours', async () => {
    // This value decides what gets written into a contractor's job timeline.
    const result = await applyHomeownerReply(fakeDb(), {
      accountId: ACCOUNT, jobId: JOB, trackingId: 'track-1', replyId: '<script>', customerName: 'Maria',
    });
    expect(result.ok).toBe(false);
    expect(feedEvents).toHaveLength(0);
  });
});
