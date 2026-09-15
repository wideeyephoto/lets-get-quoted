import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadQuoteFollowupConversation } from '@/lib/quote-followup-conversation';
import { runStalledQuoteFollowups } from '@/lib/followups';
import { quoteFollowupDeliveryEligibility } from '@/lib/quote-followup-delivery';
import { runSmsDeliveryBatch, SupabaseSmsDeliveryStore, type SmsDeliveryClaim } from '@/lib/sms-delivery-worker';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), getJob: vi.fn(), token: vi.fn(), feed: vi.fn(), sms: vi.fn(), email: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/jobs', () => ({ getJob: mocks.getJob }));
vi.mock('@/lib/job-feed', () => ({ createClientJobAccessToken: mocks.token, createJobFeedEvent: mocks.feed }));
vi.mock('@/lib/sms', () => ({ sendQuoteFollowupSms: mocks.sms }));
vi.mock('@/lib/email', () => ({ sendQuoteFollowupEmail: mocks.email }));

type Row = Record<string, unknown>;
const now = new Date('2026-09-09T10:00:00Z');
const sharedAt = '2026-09-07T08:00:00Z';
const phone = '+18103042999';
const input = { accountId: 'account-a', jobId: 'job-a', phone, sharedAt, now };
let client: SupabaseClient;
let rows: Record<string, Row[]>;
let requests: URL[];
let failingTable: string | null;
let throwOnRead: boolean;

/** Exercise the real Supabase query builder against a local in-memory fetch. */
function matches(value: unknown, filter: string): boolean {
  const dot = filter.indexOf('.');
  const operator = filter.slice(0, dot);
  const expected = filter.slice(dot + 1);
  switch (operator) {
    case 'eq': return String(value) === expected;
    case 'is': return expected === 'null' ? value == null : String(value) === expected;
    case 'gte': return value != null && String(value) >= expected;
    case 'lte': return value != null && String(value) <= expected;
    case 'in': return expected.slice(1, -1).split(',').includes(String(value));
    default: throw new Error(`Unsupported test filter ${filter}`);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  failingTable = null;
  throwOnRead = false;
  rows = {
    accounts: [{ id: 'account-a', business_name: 'BrokePipes', timezone: 'UTC', quote_followups_enabled: true,
      quote_followup_days: [2, 5], quote_followup_hour: 10, quote_followup_channel: 'auto' }],
    sites: [],
    client_job_access: [{ account_id: 'account-a', job_id: 'job-a', client_phone: phone,
      client_email: 'sarah@home.test', created_at: sharedAt, revoked_at: null, expires_at: null }],
    job_feed: [], sms_messages: [], sms_events: [],
    sms_consent: [{ account_id: 'account-a', phone_number: phone, status: 'opted_in' }],
  };
  const fetchLocal: typeof fetch = async (resource) => {
    const url = new URL(String(resource));
    requests.push(url);
    const table = url.pathname.split('/').pop()!;
    if (throwOnRead) throw new DOMException('Read aborted', 'AbortError');
    if (table === failingTable) {
      return new Response(JSON.stringify({ message: 'Activity unavailable', code: '42501' }), { status: 403 });
    }
    let result = [...(rows[table] ?? [])];
    for (const [key, filter] of url.searchParams) {
      if (['select', 'order', 'limit', 'or'].includes(key)) continue;
      result = result.filter((row) => matches(row[key], filter));
    }
    const or = url.searchParams.get('or');
    if (or) result = result.filter((row) => or.slice(1, -1).split(',').some((condition) => {
      const dot = condition.indexOf('.');
      return matches(row[condition.slice(0, dot)], condition.slice(dot + 1));
    }));
    const order = url.searchParams.get('order');
    if (order) {
      const [column, direction] = order.split('.');
      result.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === 'desc' ? -1 : 1));
    }
    const limit = url.searchParams.get('limit');
    if (limit) result = result.slice(0, Number(limit));
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  };
  client = createClient('http://followup-db.test', 'test-key', {
    global: { fetch: fetchLocal }, auth: { persistSession: false, autoRefreshToken: false },
  });
  mocks.admin.mockReturnValue(client);
  mocks.getJob.mockResolvedValue({ id: 'job-a', account_id: 'account-a', status: 'new_lead',
    client_name: 'Sarah', client_phone: phone, client_email: 'sarah@home.test' });
  mocks.token.mockResolvedValue('test-token');
  mocks.sms.mockResolvedValue('sms-event-a');
  mocks.feed.mockResolvedValue({ id: 'feed-a' });
  mocks.email.mockResolvedValue(undefined);
});

function inbound(at: string, overrides: Row = {}): Row {
  return { account_id: 'account-a', phone_number: phone, direction: 'inbound', inbox_visible: true, created_at: at, ...overrides };
}

function reply(at: string, overrides: Row = {}): Row {
  return { account_id: 'account-a', phone_number: phone, message_kind: 'inbox-reply', status: 'sent', sent_at: at, ...overrides };
}

function portal(kind: string, at: string, overrides: Row = {}): Row {
  return { account_id: 'account-a', job_id: 'job-a', kind, author: 'Owner', visibility: 'client', created_at: at, ...overrides };
}

describe('quote follow-up conversation eligibility', () => {
  it('pauses after a recent customer reply, including one already read by the owner', async () => {
    rows.sms_messages.push(inbound('2026-09-09T09:00:00Z', { read_at: '2026-09-09T09:30:00Z' }));
    expect(await loadQuoteFollowupConversation(client, input)).toMatchObject({ kind: 'ready', pauseReason: 'unanswered_customer' });
  });

  it('waits 24 hours after a successful response and permits an old answered conversation', async () => {
    rows.sms_messages.push(inbound('2026-09-07T10:00:00Z'));
    rows.sms_events.push(reply('2026-09-08T10:00:01Z'));
    expect(await loadQuoteFollowupConversation(client, input)).toMatchObject({ pauseReason: 'recent_conversation' });
    rows.sms_events[0].sent_at = '2026-09-08T10:00:00Z';
    expect(await loadQuoteFollowupConversation(client, input)).toMatchObject({ pauseReason: null });
  });

  it('does not treat an automated or failed text as an answer to older inbound', async () => {
    rows.sms_messages.push(inbound('2026-09-07T10:00:00Z'));
    rows.sms_events.push(reply('2026-09-08T09:00:00Z', { message_kind: 'quote-followup' }));
    rows.sms_events.push(reply('2026-09-08T09:30:00Z', { status: 'failed' }));
    expect(await loadQuoteFollowupConversation(client, input)).toMatchObject({ pauseReason: 'unanswered_customer' });
  });

  it('recognizes quote questions even with legacy Owner author, and portal notes without a phone', async () => {
    rows.job_feed.push(portal('client_question', '2026-09-07T10:00:00Z'));
    expect(await loadQuoteFollowupConversation(client, { ...input, phone: null })).toMatchObject({ pauseReason: 'unanswered_customer' });
    rows.job_feed = [portal('note', '2026-09-07T10:00:00Z', { author: 'Client' })];
    expect(await loadQuoteFollowupConversation(client, { ...input, phone: null })).toMatchObject({ pauseReason: 'unanswered_customer' });
    rows.job_feed.push(portal('job_update', '2026-09-08T09:00:00Z'));
    expect(await loadQuoteFollowupConversation(client, { ...input, phone: null })).toMatchObject({ pauseReason: 'unanswered_customer' });
  });

  it('excludes another tenant, customer, job, hidden messages and pre-quote activity', async () => {
    rows.sms_messages.push(inbound('2026-09-09T09:00:00Z', { account_id: 'account-b' }));
    rows.sms_messages.push(inbound('2026-09-09T09:00:00Z', { phone_number: '+18103042888' }));
    rows.sms_messages.push(inbound('2026-09-09T09:00:00Z', { inbox_visible: false }));
    rows.sms_messages.push(inbound('2026-09-06T09:00:00Z'));
    rows.job_feed.push(portal('client_question', '2026-09-09T09:00:00Z', { account_id: 'account-b' }));
    rows.job_feed.push(portal('client_question', '2026-09-09T09:00:00Z', { job_id: 'job-b' }));
    expect(await loadQuoteFollowupConversation(client, input)).toEqual({ kind: 'ready', pauseReason: null, lastActivityAt: null });
    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.searchParams.get('account_id')).toBe('eq.account-a');
      expect(request.searchParams.get('limit')).toBe('1');
    }
  });

  it.each(['sms_messages', 'sms_events', 'job_feed'])('fails closed when %s cannot be read', async (table) => {
    failingTable = table;
    expect(await loadQuoteFollowupConversation(client, input)).toEqual({ kind: 'unavailable' });
  });

  it('fails closed on rejected reads', async () => {
    throwOnRead = true;
    expect(await loadQuoteFollowupConversation(client, input)).toEqual({ kind: 'unavailable' });
  });
});

describe('stalled quote sweep', () => {
  it('queues the first nudge with its stable key after checking conversation', async () => {
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(mocks.sms).toHaveBeenCalledWith(expect.objectContaining({ stage: 'first', idempotencyKey: 'quote-followup:job-a:1' }));
  });

  it('does not mint a token or send either channel during a customer conversation', async () => {
    rows.sms_messages.push(inbound('2026-09-09T09:00:00Z'));
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('fails the job without sending if activity cannot be verified', async () => {
    failingTable = 'sms_messages';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 0, failed: 1 });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('keeps approval suppression and never reads conversation for an approved quote', async () => {
    rows.job_feed.push(portal('quote_approved', '2026-09-08T09:00:00Z'));
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(requests.some((url) => url.pathname.endsWith('/sms_messages'))).toBe(false);
  });

  it('progresses through middle and final stages without replaying sent steps', async () => {
    rows.accounts[0].quote_followup_days = [1, 2, 3];
    rows.job_feed.push(portal('quote_followup', '2026-09-08T10:00:00Z', { meta: { followup_number: 1 } }));
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 1 });
    expect(mocks.sms).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'intermediate', idempotencyKey: 'quote-followup:job-a:2' }));
    rows.job_feed.push(portal('quote_followup', now.toISOString(), { meta: { followup_number: 2 } }));
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await runStalledQuoteFollowups(new Date('2026-09-10T10:00:00Z'))).toMatchObject({ sent: 1 });
    expect(mocks.sms).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'final', idempotencyKey: 'quote-followup:job-a:3' }));
  });

  it('does not revive expired quotes after a conversation pause passes the original cutoff', async () => {
    rows.client_job_access[0].created_at = '2026-08-31T08:00:00Z';
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 0 });
    rows.sms_events.push(reply('2026-09-08T09:00:00Z'));
    expect(await runStalledQuoteFollowups(new Date('2026-09-12T10:00:00Z'))).toMatchObject({ sent: 0 });
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('retains opt-in requirements and email fallback', async () => {
    rows.sms_consent[0].status = 'opted_out';
    expect(await runStalledQuoteFollowups(now)).toMatchObject({ sent: 1 });
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(mocks.email).toHaveBeenCalledOnce();
  });
});

describe('queued quote follow-up revalidation before the provider boundary', () => {
  const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const daytime = new Date('2026-09-09T14:00:00Z');
  const claim: SmsDeliveryClaim = {
    claimToken: '22222222-2222-4222-8222-222222222222',
    eventId: '33333333-3333-4333-8333-333333333333',
    accountId: 'account-a', phoneNumber: phone, body: 'Quote reminder',
    messageKind: 'quote-followup', billingCategory: 'customer_message', senderPurpose: 'contractor_dedicated',
    attemptNumber: 1, leaseExpiresAt: '2026-09-09T14:05:00Z',
  };
  const context = { accountId: claim.accountId, eventId: claim.eventId, phone, now: daytime };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(daytime);
    rows.jobs = [{ id: jobId, account_id: 'account-a', status: 'new_lead' }];
    rows.client_job_access[0].job_id = jobId;
    rows.sms_events.push({ id: claim.eventId, account_id: 'account-a', phone_number: phone,
      message_kind: 'quote-followup', idempotency_key: `quote-followup:${jobId}:1`,
      created_at: '2026-09-09T06:00:00Z' });
  });

  afterEach(() => vi.useRealTimers());

  function delivery() {
    const store = new SupabaseSmsDeliveryStore(client);
    vi.spyOn(store, 'claimBatch').mockResolvedValueOnce([claim]).mockResolvedValue([]);
    const fail = vi.spyOn(store, 'fail').mockImplementation(async (_claim, _code, retryable) => retryable ? 'retryable' : 'terminal');
    const start = vi.spyOn(store, 'markRequestStarted').mockResolvedValue(undefined);
    const complete = vi.spyOn(store, 'complete').mockResolvedValue(undefined);
    const defer = vi.spyOn(store, 'defer').mockResolvedValue(undefined);
    const rpc = vi.spyOn(client, 'rpc').mockImplementation(() => Promise.resolve({
      data: { dispatch_status: 'ready', sender_number_id: '44444444-4444-4444-8444-444444444444',
        sender_e164: '+18103042888', provider_number_id: 'sender-test' }, error: null,
    }) as never);
    const send = vi.fn(async (_claim, _provider, _sender, _mediaUrls, beforeRequest) => {
      await beforeRequest({ kind: 'unmetered' });
      return 'provider-test-id';
    });
    const run = () => runSmsDeliveryBatch(1, store, { send }, {
      suppression: () => null, provider: () => 'signalwire', canaryAccounts: () => new Set(),
    });
    return { fail, start, complete, defer, rpc, send, run };
  }

  it('sends when the persisted quote context is still eligible', async () => {
    const check = delivery();
    expect(await check.run()).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(check.rpc).toHaveBeenCalledWith('stage_sms_delivery', expect.any(Object));
    expect(check.start).toHaveBeenCalledOnce();
    expect(check.complete).toHaveBeenCalledOnce();
  });

  it.each(['sms', 'portal'])('prevents a queued nudge after a new %s question, before staging or billing', async (channel) => {
    if (channel === 'sms') rows.sms_messages.push(inbound('2026-09-09T09:00:00Z'));
    else rows.job_feed.push(portal('client_question', '2026-09-09T09:00:00Z', { job_id: jobId }));
    const check = delivery();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await check.run()).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(check.fail).toHaveBeenCalledWith(claim, 'sms_quote_followup_conversation_active', false);
    expect(check.rpc).not.toHaveBeenCalled();
    expect(check.send).not.toHaveBeenCalled();
    expect(check.start).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(['job', 'feed'])('prevents an approved quote using the %s record', async (source) => {
    if (source === 'job') rows.jobs[0].status = 'in_progress';
    else rows.job_feed.push(portal('quote_approved', '2026-09-09T09:00:00Z', { job_id: jobId }));
    const check = delivery();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await check.run()).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(check.fail).toHaveBeenCalledWith(claim, 'sms_quote_followup_quote_superseded', false);
    expect(check.send).not.toHaveBeenCalled();
    expect(check.start).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('retries an activity read failure without crossing the request boundary', async () => {
    failingTable = 'sms_messages';
    const check = delivery();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await check.run()).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(check.fail).toHaveBeenCalledWith(claim, 'sms_quote_followup_unavailable', true);
    expect(check.rpc).not.toHaveBeenCalled();
    expect(check.send).not.toHaveBeenCalled();
    expect(check.start).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not use another account\'s event or job, or guess context from the message body', async () => {
    rows.sms_events[0].account_id = 'account-b';
    expect(await quoteFollowupDeliveryEligibility(client, context)).toBe('invalid_context');
    rows.sms_events[0].account_id = 'account-a';
    rows.jobs[0].account_id = 'account-b';
    expect(await quoteFollowupDeliveryEligibility(client, context)).toBe('quote_superseded');
    rows.jobs[0].account_id = 'account-a';
    rows.sms_events[0].idempotency_key = 'sms:quote-followup:random-manual-key';
    expect(await quoteFollowupDeliveryEligibility(client, context)).toBe('invalid_context');
  });

  it('ignores old, revoked, expired and freshly minted shares when establishing the conversation baseline', async () => {
    const link = rows.client_job_access[0];
    rows.client_job_access.push({ ...link, created_at: '2026-08-01T08:00:00Z' });
    rows.client_job_access.push({ ...link, created_at: '2026-09-06T08:00:00Z', revoked_at: '2026-09-07T08:00:00Z' });
    rows.client_job_access.push({ ...link, created_at: '2026-09-06T08:00:00Z', expires_at: '2026-09-08T08:00:00Z' });
    rows.client_job_access.push({ ...link, created_at: '2026-09-09T05:59:00Z' });
    rows.sms_messages.push(inbound('2026-09-06T09:00:00Z'));
    expect(await quoteFollowupDeliveryEligibility(client, context)).toBe('ready');
  });

  it.each(['disabled', 'email only'])('stops queued SMS when the owner chooses %s', async (setting) => {
    if (setting === 'disabled') rows.accounts[0].quote_followups_enabled = false;
    else rows.accounts[0].quote_followup_channel = 'email';
    const check = delivery();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await check.run()).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(check.fail).toHaveBeenCalledWith(claim, 'sms_quote_followup_automation_disabled', false);
    expect(check.rpc).not.toHaveBeenCalled();
    expect(check.send).not.toHaveBeenCalled();
    expect(check.start).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(['too early', 'past the stop day'])('prevents queued SMS outside the quote window: %s', async (boundary) => {
    if (boundary === 'too early') {
      // Inside the millisecond query's slack, but not yet the first local day.
      rows.client_job_access[0].created_at = '2026-09-08T05:00:00Z';
    } else {
      // Valid when queued on day 2, stale when dispatch is delayed to day 9.
      vi.setSystemTime(new Date('2026-09-16T14:00:00Z'));
    }
    const check = delivery();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await check.run()).toMatchObject({ completedCount: 0, failedCount: 1 });
    expect(check.fail).toHaveBeenCalledWith(claim, 'sms_quote_followup_quote_superseded', false);
    expect(check.rpc).not.toHaveBeenCalled();
    expect(check.send).not.toHaveBeenCalled();
    expect(check.start).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
