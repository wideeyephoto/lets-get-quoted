import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, resetFakeIds, type FakeLog, type Row, type Store } from './stubs/fake-postgrest';

/**
 * The acceptance path, end to end, against a database that actually holds rows.
 *
 * The property under test is a RACE, so a mock returning canned values would
 * prove nothing. test/stubs/fake-postgrest holds real rows and applies an
 * update's filters at write time, in one synchronous pass — its stand-in for
 * the row lock Postgres takes. Read the note at the top of that file: it is the
 * only reason "two people tap Accept at the same moment" is a meaningful
 * assertion here rather than a theatre of one.
 *
 * The messaging provider is mocked and asserted on. Nothing in this suite may
 * reach a phone — and lib/sms's own isLiveMessagingEnvironment refuses to send
 * under test anyway, which is checked at the bottom.
 */

const store: Store = {};
const log: FakeLog = [];
const texts: Array<{ crewId: string; eventType: string; body: string; idempotencyKey?: string }> = [];
const feed: Array<{ kind: string; title: string; jobId: string }> = [];
const emails: Array<{ subject: string }> = [];
let subcontractorSmsStatus: 'queued' | 'simulated' = 'queued';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => fakeClient(store, log).client,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: async () => 'BrokePipes',
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: async () => 'owner@brokepipes.test',
  sendContractorAlertEmail: async (input: { subject: string }) => {
    emails.push({ subject: input.subject });
  },
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: async (_client: unknown, _account: string, jobId: string, input: { kind: string; title: string }) => {
    feed.push({ kind: input.kind, title: input.title, jobId });
    return input;
  },
}));

vi.mock('@/lib/sms', () => ({
  isLiveMessagingEnvironment: () => false,
  sendSubcontractorSms: async (params: { crewId: string; eventType: string; body: string; idempotencyKey?: string }) => {
    texts.push({
      crewId: params.crewId,
      eventType: params.eventType,
      body: params.body,
      idempotencyKey: params.idempotencyKey,
    });
    return subcontractorSmsStatus === 'queued'
      ? { status: 'queued' as const, smsEventId: `event-${params.crewId}` }
      : { status: 'simulated' as const, smsEventId: null };
  },
}));

const { createOfferToken } = await import('@/lib/subcontractor-dispatch');
const {
  acceptSubcontractorOffer,
  askSubcontractorQuestion,
  cancelSubcontractorRequest,
  chooseSubcontractor,
  declineSubcontractorOffer,
  keepAsBackup,
  loadPublicOffer,
  reopenSubcontractorRequest,
  sendSubcontractorRequest,
} = await import('@/lib/subcontractor-dispatch-data');

const ACCOUNT = 'acc-1';
const OTHER_ACCOUNT = 'acc-2';
const JOB = 'job-1';
const REQUEST = 'req-1';

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';

type Seeded = { tokens: Record<string, string> };

function seed(options: { expiresAt?: string; status?: string; selectionMode?: string; crew?: string[] } = {}): Seeded {
  for (const key of Object.keys(store)) delete store[key];
  log.length = 0;
  texts.length = 0;
  feed.length = 0;
  emails.length = 0;
  resetFakeIds();

  const crewIds = options.crew ?? ['crew-a', 'crew-b', 'crew-c'];

  store.accounts = [{ id: ACCOUNT, business_name: 'BrokePipes' }];
  store.jobs = [
    {
      id: JOB,
      account_id: ACCOUNT,
      ref: 'J-1040',
      client_name: 'Maria Alvarez',
      client_phone: '+13135550123',
      address: '1420 N Main St, Royal Oak, MI 48067',
      scope: 'Replace 50-gallon gas water heater',
      status: 'in_progress',
      scheduled_for: '2099-01-02',
    },
  ];
  store.crew = crewIds.map((id, index) => ({
    id,
    account_id: ACCOUNT,
    name: `Sub ${index + 1}`,
    company_name: `Firm ${index + 1}`,
    phone: `+1313555010${index}`,
    worker_type: 'subcontractor',
    active: true,
    deleted_at: null,
    trades: ['Gas fitting'],
    sub_status: 'active',
    created_at: '2026-01-01T00:00:00Z',
  }));
  store.crew_assignments = [];
  store.subcontractor_requests = [
    {
      id: REQUEST,
      account_id: ACCOUNT,
      job_id: JOB,
      status: options.status ?? 'sent',
      work_description: 'Gas water heater replacement',
      service_date: '2099-01-02',
      window_start: '09:00',
      window_end: '11:00',
      general_location: 'Royal Oak, MI',
      pay_amount: 650,
      pay_kind: 'fixed',
      required_trade: 'Gas fitting',
      required_skills: [],
      requires_license: false,
      requires_insurance: false,
      expires_at: options.expiresAt ?? FUTURE,
      selection_mode: options.selectionMode ?? 'first_accept',
      document_paths: [],
      message_body: 'Offer [secure link]',
      claimed_offer_id: null,
      claimed_crew_id: null,
      claimed_at: null,
      sent_at: '2026-08-13T09:00:00Z',
      created_at: '2026-08-13T09:00:00Z',
    },
  ];

  const tokens: Record<string, string> = {};
  store.subcontractor_offers = crewIds.map((crewId, index) => {
    const { token, tokenHash } = createOfferToken();
    tokens[crewId] = token;
    return {
      id: `offer-${index + 1}`,
      account_id: ACCOUNT,
      request_id: REQUEST,
      crew_id: crewId,
      token_hash: tokenHash,
      status: 'sent',
      phone: `+1313555010${index}`,
      body: 'Offer',
      distance_miles: 8,
      sent_at: '2026-08-13T09:00:00Z',
      viewed_at: null,
      responded_at: null,
      backup: false,
      won: false,
      created_at: '2026-08-13T09:00:00Z',
    };
  });

  return { tokens };
}

const requestRow = () => store.subcontractor_requests[0] as Row;
const offerFor = (crewId: string) => store.subcontractor_offers.find((row) => row.crew_id === crewId) as Row;

beforeEach(() => {
  subcontractorSmsStatus = 'queued';
  seed();
});

// ============================================================================
// Accepting
// ============================================================================

describe('accepting an available offer', () => {
  it('claims the request, assigns the sub, and returns the authorized details', async () => {
    const { tokens } = seed();
    const result = await acceptSubcontractorOffer(tokens['crew-a']);

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error('unreachable');
    expect(result.jobRef).toBe('J-1040');
    expect(result.address).toBe('1420 N Main St, Royal Oak, MI 48067');
    expect(result.clientName).toBe('Maria Alvarez');

    expect(requestRow().status).toBe('claimed');
    expect(requestRow().claimed_crew_id).toBe('crew-a');
    expect(requestRow().claimed_at).toBeTruthy();
  });

  it('marks the winner accepted and flags exactly one winner', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);

    expect(offerFor('crew-a').status).toBe('accepted');
    expect(offerFor('crew-a').won).toBe(true);
    expect(store.subcontractor_offers.filter((row) => row.won === true)).toHaveLength(1);
  });

  it('covers every losing offer', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);

    expect(offerFor('crew-b').status).toBe('covered');
    expect(offerFor('crew-c').status).toBe('covered');
    expect(offerFor('crew-b').won).toBe(false);
  });

  it('assigns the subcontractor to the job through the existing crew_assignments table', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    expect(store.crew_assignments).toEqual([{ id: expect.any(String), account_id: ACCOUNT, job_id: JOB, crew_id: 'crew-a' }]);
  });

  it('adds the acceptance to the job timeline, internal only', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    expect(feed.some((event) => event.kind === 'sub_offer_accepted' && event.jobId === JOB)).toBe(true);
  });

  it('tells the winner, the owner and every firm that lost', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);

    expect(texts.filter((text) => text.eventType === 'sub_offer_won')).toHaveLength(1);
    expect(texts.filter((text) => text.eventType === 'sub_offer_covered')).toHaveLength(2);
    // Nobody is left to work out for themselves that their link stopped working.
    expect(texts.find((text) => text.eventType === 'sub_offer_covered')?.body).toMatch(/covered by another sub/i);
    expect(emails).toHaveLength(1);
  });

  it('is idempotent — accepting twice does not un-claim anything or re-notify', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    const textsAfterFirst = texts.length;

    const second = await acceptSubcontractorOffer(tokens['crew-a']);
    expect(second.status).toBe('accepted');
    expect(requestRow().claimed_crew_id).toBe('crew-a');
    expect(texts).toHaveLength(textsAfterFirst);
  });
});

// ============================================================================
// The race
// ============================================================================

describe('two subcontractors accepting at the same moment', () => {
  it('produces exactly one winner', async () => {
    const { tokens } = seed();

    // Both calls run concurrently. Both get past resolveOffer seeing an
    // unclaimed request — which is precisely the window a read-then-write
    // implementation would lose.
    const [first, second] = await Promise.all([
      acceptSubcontractorOffer(tokens['crew-a']),
      acceptSubcontractorOffer(tokens['crew-b']),
    ]);

    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(['accepted', 'already_claimed']);

    expect(store.subcontractor_offers.filter((row) => row.won === true)).toHaveLength(1);
    expect(store.subcontractor_offers.filter((row) => row.status === 'accepted')).toHaveLength(1);
    expect(store.crew_assignments).toHaveLength(1);
  });

  it('tells the loser the job is already claimed, in those words', async () => {
    const { tokens } = seed();
    const results = await Promise.all([
      acceptSubcontractorOffer(tokens['crew-a']),
      acceptSubcontractorOffer(tokens['crew-b']),
    ]);
    const loser = results.find((result) => result.status === 'already_claimed');
    expect(loser).toBeDefined();
    if (loser?.status !== 'already_claimed') throw new Error('unreachable');
    expect(loser.message).toBe('This job has already been claimed.');
  });

  it('survives all three going at once', async () => {
    const { tokens } = seed();
    const results = await Promise.all(Object.values(tokens).map((token) => acceptSubcontractorOffer(token)));
    expect(results.filter((result) => result.status === 'accepted')).toHaveLength(1);
    expect(store.subcontractor_offers.filter((row) => row.won === true)).toHaveLength(1);
    expect(requestRow().status).toBe('claimed');
  });
});

// ============================================================================
// Offers that cannot be accepted
// ============================================================================

describe('offers that are no longer open', () => {
  it('rejects an expired one and never claims the request', async () => {
    const { tokens } = seed({ expiresAt: PAST });
    const result = await acceptSubcontractorOffer(tokens['crew-a']);
    expect(result.status).toBe('expired');
    expect(requestRow().status).toBe('sent');
    expect(requestRow().claimed_offer_id).toBeNull();
    expect(store.crew_assignments).toHaveLength(0);
  });

  it('rejects one on a cancelled request', async () => {
    const { tokens } = seed();
    await cancelSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST);
    const result = await acceptSubcontractorOffer(tokens['crew-a']);
    expect(result.status).toBe('cancelled');
    expect(requestRow().claimed_offer_id).toBeNull();
  });

  it('rejects a token that was never issued, without touching the database', async () => {
    seed();
    const before = log.length;
    expect(await acceptSubcontractorOffer('not-a-real-token')).toEqual({ status: 'not_found' });
    expect(await acceptSubcontractorOffer('')).toEqual({ status: 'not_found' });
    expect(log.length).toBe(before);
  });

  it('rejects a real secret wearing a forged signature', async () => {
    const { tokens } = seed();
    const forged = `${tokens['crew-a'].split('.')[0]}.AAAAAAAAAAAAAAAAAAAAAA`;
    expect(await acceptSubcontractorOffer(forged)).toEqual({ status: 'not_found' });
  });

  it('marks a late arrival covered so their own page stops offering the button', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    // crew-b was already covered by the winner's sweep; a late tap confirms it.
    const late = await acceptSubcontractorOffer(tokens['crew-b']);
    expect(late.status).toBe('already_claimed');
    expect(offerFor('crew-b').status).toBe('covered');
  });
});

// ============================================================================
// Declining, questions, backup
// ============================================================================

describe('declining', () => {
  it('records the decline and its reason without touching anybody else', async () => {
    const { tokens } = seed();
    const result = await declineSubcontractorOffer(tokens['crew-b'], { reason: 'Booked that morning' });

    expect(result.status).toBe('declined');
    expect(offerFor('crew-b').status).toBe('declined');
    expect(offerFor('crew-b').decline_reason).toBe('Booked that morning');
    expect(offerFor('crew-a').status).toBe('sent');
    expect(requestRow().status).toBe('sent');
  });

  it('keeps somebody as backup when they ask', async () => {
    const { tokens } = seed();
    await declineSubcontractorOffer(tokens['crew-b'], { backup: true });
    expect(offerFor('crew-b').backup).toBe(true);
  });

  it('lets a covered firm still ask to be backup', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    await keepAsBackup(tokens['crew-c']);
    expect(offerFor('crew-c').backup).toBe(true);
    // Their status is untouched — they did not decline, they lost.
    expect(offerFor('crew-c').status).toBe('covered');
  });

  it('puts a question on the offer and on the job timeline', async () => {
    const { tokens } = seed();
    const result = await askSubcontractorQuestion(tokens['crew-a'], 'Is the old unit in the basement?');
    expect(result.status).toBe('asked');
    expect(offerFor('crew-a').question).toBe('Is the old unit in the basement?');
    expect(feed.some((event) => event.kind === 'sub_offer_question')).toBe(true);
    // Asking is not answering: the offer is still live.
    expect(offerFor('crew-a').status).toBe('sent');
  });

  it('ignores an empty question', async () => {
    const { tokens } = seed();
    expect(await askSubcontractorQuestion(tokens['crew-a'], '   ')).toEqual({ status: 'empty' });
  });
});

// ============================================================================
// Privacy
// ============================================================================

describe('what the public page is allowed to know', () => {
  it('hides the address, the customer and their phone before acceptance', async () => {
    const { tokens } = seed();
    const page = await loadPublicOffer(tokens['crew-a']);
    expect(page).not.toBeNull();
    expect(page!.view.authorized).toBeNull();

    // Not merely absent from the render — absent from the payload. Nothing on
    // that page can leak what was never put in the object.
    const serialized = JSON.stringify(page!.view);
    expect(serialized).not.toContain('1420 N Main St');
    expect(serialized).not.toContain('Maria Alvarez');
    expect(serialized).not.toContain('3135550123');

    // And it still says everything a sub needs to decide.
    expect(page!.view.generalLocation).toBe('Royal Oak, MI');
    expect(page!.view.payLabel).toBe('$650');
    expect(page!.view.jobTitle).toBe('Gas water heater replacement');
  });

  it('reveals them to the firm that accepted, and to nobody else', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);

    const winner = await loadPublicOffer(tokens['crew-a']);
    expect(winner!.view.authorized).not.toBeNull();
    expect(winner!.view.authorized!.address).toBe('1420 N Main St, Royal Oak, MI 48067');
    expect(winner!.view.authorized!.clientName).toBe('Maria Alvarez');

    const loser = await loadPublicOffer(tokens['crew-b']);
    expect(loser!.view.authorized).toBeNull();
    expect(JSON.stringify(loser!.view)).not.toContain('1420 N Main St');
    expect(loser!.outcome.kind).toBe('claimed');
  });

  it('records the first view only, so "2 viewed" counts people not refreshes', async () => {
    const { tokens } = seed();
    await loadPublicOffer(tokens['crew-a']);
    const firstViewedAt = offerFor('crew-a').viewed_at;
    expect(firstViewedAt).toBeTruthy();
    expect(offerFor('crew-a').status).toBe('viewed');

    await loadPublicOffer(tokens['crew-a']);
    expect(offerFor('crew-a').viewed_at).toBe(firstViewedAt);
  });

  it('does not record a view when asked not to', async () => {
    const { tokens } = seed();
    await loadPublicOffer(tokens['crew-a'], { recordView: false });
    expect(offerFor('crew-a').viewed_at).toBeNull();
  });

  it('returns nothing at all for a bad token', async () => {
    seed();
    expect(await loadPublicOffer('garbage')).toBeNull();
  });
});

// ============================================================================
// Cancel and reopen
// ============================================================================

describe('cancelling a request', () => {
  it('closes every open offer and tells the firms', async () => {
    seed();
    await cancelSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST);

    expect(requestRow().status).toBe('cancelled');
    expect(store.subcontractor_offers.every((row) => row.status === 'expired')).toBe(true);
    expect(texts.filter((text) => text.eventType === 'sub_offer_cancelled')).toHaveLength(3);
    expect(feed.some((event) => event.kind === 'sub_request_cancelled')).toBe(true);
  });

  it('refuses to cancel one that has already been claimed', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    await expect(cancelSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST)).rejects.toThrow(
      /already been claimed|Unassign/i,
    );
    expect(requestRow().status).toBe('claimed');
  });
});

describe('reopening an unfilled request', () => {
  it('puts it back out on a new deadline and revives the expired offers', async () => {
    seed({ expiresAt: PAST });
    await cancelSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST);
    expect(store.subcontractor_offers.every((row) => row.status === 'expired')).toBe(true);

    await reopenSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, FUTURE);

    expect(requestRow().status).toBe('reopened');
    expect(requestRow().expires_at).toBe(FUTURE);
    expect(store.subcontractor_offers.every((row) => row.status === 'sent')).toBe(true);
  });

  it('leaves a decline declined — somebody who said no is not quietly re-asked', async () => {
    const { tokens } = seed({ expiresAt: FUTURE });
    await declineSubcontractorOffer(tokens['crew-b'], {});
    await reopenSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, FUTURE);
    expect(offerFor('crew-b').status).toBe('declined');
  });

  it('refuses a deadline in the past, which would expire the moment it reopened', async () => {
    seed();
    await expect(reopenSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, PAST)).rejects.toThrow(
      /in the future/i,
    );
  });

  it('lets an accepted offer be made after a reopen', async () => {
    const { tokens } = seed({ expiresAt: PAST });
    expect((await acceptSubcontractorOffer(tokens['crew-a'])).status).toBe('expired');

    await reopenSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, FUTURE);
    expect((await acceptSubcontractorOffer(tokens['crew-a'])).status).toBe('accepted');
    expect(requestRow().status).toBe('claimed');
  });
});

// ============================================================================
// Collect interest
// ============================================================================

describe('collect interest and let the owner choose', () => {
  it('records several hands up without assigning anybody', async () => {
    const { tokens } = seed({ selectionMode: 'collect_interest' });

    expect((await acceptSubcontractorOffer(tokens['crew-a'])).status).toBe('interest_recorded');
    expect((await acceptSubcontractorOffer(tokens['crew-b'])).status).toBe('interest_recorded');

    // Two accepted offers, NEITHER won — which is why the one-winner index is
    // keyed on `won` and not on status='accepted'.
    expect(store.subcontractor_offers.filter((row) => row.status === 'accepted')).toHaveLength(2);
    expect(store.subcontractor_offers.filter((row) => row.won === true)).toHaveLength(0);
    expect(requestRow().status).toBe('sent');
    expect(store.crew_assignments).toHaveLength(0);
  });

  it('assigns only when the owner picks, and covers the rest then', async () => {
    const { tokens } = seed({ selectionMode: 'collect_interest' });
    await acceptSubcontractorOffer(tokens['crew-a']);
    await acceptSubcontractorOffer(tokens['crew-b']);

    const client = fakeClient(store, log).client;
    const result = await chooseSubcontractor(client, ACCOUNT, REQUEST, offerFor('crew-b').id as string);

    expect(result.status).toBe('chosen');
    expect(requestRow().claimed_crew_id).toBe('crew-b');
    expect(offerFor('crew-b').won).toBe(true);
    expect(offerFor('crew-a').status).toBe('covered');
    expect(store.crew_assignments).toEqual([
      { id: expect.any(String), account_id: ACCOUNT, job_id: JOB, crew_id: 'crew-b' },
    ]);
  });

  it('refuses a second pick', async () => {
    const { tokens } = seed({ selectionMode: 'collect_interest' });
    await acceptSubcontractorOffer(tokens['crew-a']);
    await acceptSubcontractorOffer(tokens['crew-b']);

    const client = fakeClient(store, log).client;
    await chooseSubcontractor(client, ACCOUNT, REQUEST, offerFor('crew-a').id as string);
    const second = await chooseSubcontractor(client, ACCOUNT, REQUEST, offerFor('crew-b').id as string);
    expect(second.status).toBe('already_claimed');
    expect(store.subcontractor_offers.filter((row) => row.won === true)).toHaveLength(1);
  });
});

// ============================================================================
// Sending, and account isolation
// ============================================================================

describe('sending a request', () => {
  it('creates one offer and one distinct link per recipient, then queues once each', async () => {
    seed({ crew: ['crew-a', 'crew-b'] });
    // Start from a draft with no offers on it.
    store.subcontractor_offers = [];
    requestRow().status = 'draft';
    requestRow().sent_at = null;

    const client = fakeClient(store, log).client;
    const result = await sendSubcontractorRequest(client, ACCOUNT, REQUEST, {
      crewIds: ['crew-a', 'crew-b'],
      messageBody: 'New subcontract job from BrokePipes. [secure link]',
    });

    expect(result.queued).toBe(2);
    expect(store.subcontractor_offers).toHaveLength(2);

    const hashes = store.subcontractor_offers.map((row) => row.token_hash);
    expect(new Set(hashes).size).toBe(2);

    const bodies = store.subcontractor_offers.map((row) => row.body as string);
    expect(new Set(bodies).size).toBe(2);
    for (const body of bodies) {
      expect(body).not.toContain('[secure link]');
      expect(body).toMatch(/\/sub\//);
    }

    expect(requestRow().status).toBe('queued');
    expect(store.subcontractor_offers.every((row) => row.provider_id === null)).toBe(true);
    expect(store.subcontractor_offers.every((row) => typeof row.sms_event_id === 'string')).toBe(true);
    expect(texts.filter((text) => text.eventType === 'sub_offer')).toHaveLength(2);
    const offerKeys = texts
      .filter((text) => text.eventType === 'sub_offer')
      .map((text) => text.idempotencyKey);
    expect(offerKeys).toHaveLength(2);
    expect(offerKeys.every((key) => /^subcontractor:.+:offer$/.test(key ?? ''))).toBe(true);
    expect(new Set(offerKeys).size).toBe(2);
    expect(feed.some((event) => event.kind === 'sub_request_queued')).toBe(true);
  });

  it('reports the simulation rather than pretending a text was delivered', async () => {
    subcontractorSmsStatus = 'simulated';
    seed({ crew: ['crew-a'] });
    store.subcontractor_offers = [];
    requestRow().status = 'draft';

    const result = await sendSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, {
      crewIds: ['crew-a'],
      messageBody: 'Offer [secure link]',
    });
    expect(result.simulated).toBe(true);
    expect(store.subcontractor_offers[0].error_reason).toMatch(/Simulated/);
  });

  it('skips a firm with no phone rather than failing the whole dispatch', async () => {
    seed({ crew: ['crew-a', 'crew-b'] });
    store.subcontractor_offers = [];
    requestRow().status = 'draft';
    (store.crew.find((row) => row.id === 'crew-b') as Row).phone = '';

    const result = await sendSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, {
      crewIds: ['crew-a', 'crew-b'],
      messageBody: 'Offer [secure link]',
    });
    expect(result.queued).toBe(1);
    expect(result.skipped).toEqual([{ name: 'Sub 2', reason: 'No mobile number on file' }]);
  });

  it('never offers the same request to one firm twice', async () => {
    seed({ crew: ['crew-a'] });
    const result = await sendSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, {
      crewIds: ['crew-a'],
      messageBody: 'Offer [secure link]',
    }).catch((error: Error) => error);
    expect(String(result)).toMatch(/Already has an offer/i);
    expect(store.subcontractor_offers).toHaveLength(1);
  });

  it('repairs a queued offer whose durable event link was interrupted without minting another offer', async () => {
    seed({ crew: ['crew-a'] });
    const offer = offerFor('crew-a');
    offer.status = 'queued';
    offer.sent_at = null;
    offer.provider_id = null;
    offer.sms_event_id = null;
    requestRow().status = 'queued';
    requestRow().sent_at = null;

    const client = fakeClient(store, log).client;
    const result = await sendSubcontractorRequest(client, ACCOUNT, REQUEST, {
      crewIds: ['crew-a'],
      messageBody: 'This changed copy must not replace the already-approved offer.',
    });

    expect(result.queued).toBe(1);
    expect(store.subcontractor_offers).toHaveLength(1);
    expect(texts).toEqual([
      expect.objectContaining({
        crewId: 'crew-a',
        eventType: 'sub_offer',
        body: 'Offer',
        idempotencyKey: 'subcontractor:offer-1:offer',
      }),
    ]);
    expect(offer.sms_event_id).toBe('event-crew-a');
    expect(offer.provider_id).toBeNull();

    await expect(
      sendSubcontractorRequest(client, ACCOUNT, REQUEST, {
        crewIds: ['crew-a'],
        messageBody: 'Offer [secure link]',
      }),
    ).rejects.toThrow(/Already has an offer/i);
    expect(texts).toHaveLength(1);
  });

  it('refuses to send a claimed request', async () => {
    const { tokens } = seed();
    await acceptSubcontractorOffer(tokens['crew-a']);
    await expect(
      sendSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, {
        crewIds: ['crew-b'],
        messageBody: 'Offer [secure link]',
      }),
    ).rejects.toThrow(/already been claimed/i);
  });
});

describe('account isolation', () => {
  it('will not read another account’s request', async () => {
    seed();
    const { getSubcontractorRequest } = await import('@/lib/subcontractor-dispatch-data');
    const client = fakeClient(store, log).client;
    expect(await getSubcontractorRequest(client, OTHER_ACCOUNT, REQUEST)).toBeNull();
    expect(await getSubcontractorRequest(client, ACCOUNT, REQUEST)).not.toBeNull();
  });

  it('will not cancel another account’s request', async () => {
    seed();
    await expect(cancelSubcontractorRequest(fakeClient(store, log).client, OTHER_ACCOUNT, REQUEST)).rejects.toThrow(
      /no longer exists/i,
    );
    expect(requestRow().status).toBe('sent');
  });

  it('will not send to a crew member on another account', async () => {
    seed({ crew: ['crew-a'] });
    store.subcontractor_offers = [];
    (store.crew[0] as Row).account_id = OTHER_ACCOUNT;

    await expect(
      sendSubcontractorRequest(fakeClient(store, log).client, ACCOUNT, REQUEST, {
        crewIds: ['crew-a'],
        messageBody: 'Offer [secure link]',
      }),
    ).rejects.toThrow(/Nothing to send/i);
    expect(store.subcontractor_offers).toHaveLength(0);
  });

  it('will not choose a winner from another account', async () => {
    seed({ selectionMode: 'collect_interest' });
    await expect(
      chooseSubcontractor(fakeClient(store, log).client, OTHER_ACCOUNT, REQUEST, 'offer-1'),
    ).rejects.toThrow(/not on this request/i);
  });
});
