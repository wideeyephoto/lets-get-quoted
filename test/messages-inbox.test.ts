import { describe, it, expect } from 'vitest';
import {
  listConversations,
  loadConversationMessages,
  loadConversations,
  loadCurrentSmsConsentPhones,
  markThreadRead,
} from '../src/lib/messages';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = { phone_number: string; body: string; direction: string; created_at: string; read_at?: string | null; media_urls?: string[] | null };

// A stub that answers the two queries listConversations makes: the message slice
// and the jobs/leads name lookup. `smsError` simulates a pre-migration database
// where read_at / media_urls do not exist yet.
function client(rows: Row[], opts: {
  smsError?: boolean;
  fallbackError?: boolean;
  eventError?: boolean;
  threadError?: boolean;
  events?: Array<Record<string, unknown>>;
  names?: Array<{ name: string; phone: string }>;
} = {}): SupabaseClient {
  let smsCalls = 0;
  const api = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: (columns: string) => {
          if (table === 'sms_messages') {
            smsCalls += 1;
            if (columns === '*' && opts.threadError) {
              chain.__result = { data: null, error: { message: 'thread unavailable' } };
              return chain;
            }
            const wantsNewColumns = columns.includes('read_at');
            if (opts.smsError && wantsNewColumns) {
              chain.__result = { data: null, error: { message: 'column does not exist' } };
            } else if (opts.smsError && opts.fallbackError) {
              chain.__result = { data: null, error: { message: 'transcript unavailable' } };
            } else if (opts.smsError) {
              // The fallback query cannot select columns that do not exist, so
              // the rows come back without them at all.
              chain.__result = {
                data: rows.map(({ read_at: _r, media_urls: _m, ...rest }) => rest),
                error: null,
              };
            } else {
              chain.__result = { data: rows, error: null };
            }
          } else if (table === 'sms_events') {
            chain.__result = opts.eventError
              ? { data: null, error: { message: 'delivery overlay unavailable' } }
              : { data: opts.events ?? [], error: null };
          } else if (table === 'leads') {
            chain.__result = { data: opts.names ?? [], error: null };
          } else {
            chain.__result = { data: [], error: null };
          }
          return chain;
        },
        // `in` and `or` back the platform-lane exclusion: `in` reads the lane
        // list from sms_sender_numbers, `or` applies the null-preserving filter.
        // This stub returns no lanes, so these tests exercise the unfiltered path.
        eq: self, not: self, order: self, in: self, or: self,
        limit: () => Promise.resolve(chain.__result),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(chain.__result).then(resolve),
      });
      return chain;
    },
    get smsCalls() { return smsCalls; },
  };
  return api as unknown as SupabaseClient;
}

const row = (over: Partial<Row> = {}): Row => ({
  phone_number: '+12485550100',
  body: 'Hi there',
  direction: 'inbound',
  created_at: '2026-08-04T12:00:00Z',
  read_at: null,
  media_urls: null,
  ...over,
});

describe('listConversations', () => {
  it('counts EVERY unread in a thread, not just the newest', async () => {
    // Three unanswered texts should say three. Counting only the latest message
    // would show 1 and make a busy thread look like a quiet one.
    const rows = [
      row({ created_at: '2026-08-04T12:02:00Z', body: 'still there?' }),
      row({ created_at: '2026-08-04T12:01:00Z', body: 'hello?' }),
      row({ created_at: '2026-08-04T12:00:00Z', body: 'hi' }),
    ];
    const [conversation] = await listConversations(client(rows), 'acct-1');
    expect(conversation.unread).toBe(3);
    expect(conversation.lastBody).toBe('still there?');
  });

  it('does not count our own replies as unread', async () => {
    const rows = [
      row({ created_at: '2026-08-04T12:02:00Z', direction: 'outbound', body: 'on my way' }),
      row({ created_at: '2026-08-04T12:00:00Z', body: 'are you coming?' }),
    ];
    const [conversation] = await listConversations(client(rows), 'acct-1');
    expect(conversation.unread).toBe(1);
    expect(conversation.lastDirection).toBe('outbound');
  });

  it('counts nothing once the thread has been read', async () => {
    const rows = [row({ read_at: '2026-08-04T12:05:00Z' })];
    const [conversation] = await listConversations(client(rows), 'acct-1');
    expect(conversation.unread).toBe(0);
  });

  it('keeps threads separate', async () => {
    const rows = [
      row({ phone_number: '+12485550100', created_at: '2026-08-04T12:02:00Z' }),
      row({ phone_number: '+12485550200', created_at: '2026-08-04T12:01:00Z', read_at: '2026-08-04T12:03:00Z' }),
    ];
    const conversations = await listConversations(client(rows), 'acct-1');
    expect(conversations).toHaveLength(2);
    expect(conversations.find((c) => c.phone === '+12485550100')?.unread).toBe(1);
    expect(conversations.find((c) => c.phone === '+12485550200')?.unread).toBe(0);
  });

  it('flags a photo so a caption-less text does not preview as blank', async () => {
    const rows = [row({ body: '', media_urls: ['https://api.twilio.com/media/abc'] })];
    const [conversation] = await listConversations(client(rows), 'acct-1');
    expect(conversation.lastHasMedia).toBe(true);
    expect(conversation.lastBody).toBe('');
  });

  it('still lists threads on a database without the new columns', async () => {
    // The feature deploys before the migration is applied; the page must not
    // break in that window, it just cannot show unread.
    const rows = [row()];
    const stub = client(rows, { smsError: true });
    const conversations = await listConversations(stub, 'acct-1');
    expect(conversations).toHaveLength(1);
    expect(conversations[0].unread).toBe(0);
    expect((stub as unknown as { smsCalls: number }).smsCalls).toBe(2); // tried the new columns, fell back
  });

  it('distinguishes an unreadable transcript from a genuinely empty inbox', async () => {
    await expect(loadConversations(client([], { smsError: true, fallbackError: true }), 'acct-1'))
      .resolves.toEqual({ kind: 'unavailable', data: [] });
  });

  it('fails closed when queued delivery events cannot be overlaid', async () => {
    await expect(loadConversations(client([row()], { eventError: true }), 'acct-1'))
      .resolves.toEqual({ kind: 'unavailable', data: [] });
  });

  it('distinguishes an unreadable open thread from a thread with no messages', async () => {
    await expect(loadConversationMessages(
      client([], { threadError: true }),
      'acct-1',
      '+12485550100',
    )).resolves.toEqual({ kind: 'unavailable', data: [] });
  });

  it('overlays delivery failures from automated SMS into customer thread', async () => {
    const threadMessages = [row({ phone_number: '+12485550100', body: 'Can I get a quote?', direction: 'inbound' })];
    const failedEvent = {
      id: 'event-failed-reminder',
      account_id: 'acct-1',
      phone_number: '+12485550100',
      body: 'Appointment reminder: tomorrow at 9am',
      provider_id: 'SM999',
      provider: 'twilio',
      sender_number_id: 'num-1',
      status: 'failed',
      queued_at: '2026-08-04T12:05:00Z',
      created_at: '2026-08-04T12:05:00Z',
    };
    const res = await loadConversationMessages(
      client(threadMessages, { events: [failedEvent] }),
      'acct-1',
      '+12485550100',
    );
    expect(res.kind).toBe('ready');
    expect(res.data).toHaveLength(2);
    const failedMsg = res.data.find((m) => m.id === 'event-failed-reminder');
    expect(failedMsg?.delivery_status).toBe('failed');
    expect(failedMsg?.direction).toBe('outbound');
    expect(failedMsg?.body).toBe('Appointment reminder: tomorrow at 9am');
  });
});

describe('markThreadRead', () => {
  function updateClient(error: unknown = null, data: unknown[] = [{ id: 'message-1' }]) {
    const calls: Array<[string, ...unknown[]]> = [];
    const api = {
      from(table: string) {
        const chain = {
          update(value: unknown) { calls.push(['update', value]); return chain; },
          eq(column: string, value: unknown) { calls.push(['eq', column, value]); return chain; },
          is(column: string, value: unknown) { calls.push(['is', column, value]); return chain; },
          lte(column: string, value: unknown) { calls.push(['lte', column, value]); return chain; },
          select(columns: string) { calls.push(['select', columns]); return chain; },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data, error }).then(resolve);
          },
        };
        calls.push(['from', table]);
        return chain;
      },
    } as unknown as SupabaseClient;
    return { api, calls };
  }

  it('marks only inbound messages that were rendered in the open pane', async () => {
    const { api, calls } = updateClient();
    const through = '2026-08-04T12:02:00Z';

    await expect(markThreadRead(api, 'acct-1', '+12485550100', through)).resolves.toBe(true);
    expect(calls).toContainEqual(['eq', 'direction', 'inbound']);
    expect(calls).toContainEqual(['is', 'read_at', null]);
    expect(calls).toContainEqual(['lte', 'created_at', through]);
    expect(calls).toContainEqual(['select', 'id']);
  });

  it('reports a failed update so the client does not enter a refresh loop', async () => {
    const { api } = updateClient({ message: 'column does not exist' });
    await expect(markThreadRead(api, 'acct-1', '+12485550100')).resolves.toBe(false);
  });

  it('does not refresh when row-level security updates nothing', async () => {
    const { api } = updateClient(null, []);
    await expect(markThreadRead(api, 'acct-1', '+12485550100')).resolves.toBe(false);
  });
});

describe('manual compose consent destinations', () => {
  function consentClient(input: {
    consent?: unknown[] | null;
    scopes?: unknown[] | null;
    consentError?: unknown;
    scopeError?: unknown;
  }): SupabaseClient {
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        const result = table === 'sms_consent_scopes'
          ? { data: input.scopes ?? [], error: input.scopeError ?? null }
          : { data: input.consent ?? [], error: input.consentError ?? null };
        Object.assign(chain, {
          select: self,
          eq: self,
          not: self,
          is: self,
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
        });
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  it('returns only normalized, current customer-scoped destinations', async () => {
    const result = await loadCurrentSmsConsentPhones(consentClient({
      consent: [
        { phone_number: '(248) 555-0100', status: 'opted_in', consented_at: '2026-08-21T00:00:00Z', opted_out_at: null },
        { phone_number: '+12485550200', status: 'opted_in', consented_at: '2026-08-21T00:00:00Z', opted_out_at: null },
        { phone_number: '+12485550300', status: 'opted_in', consented_at: '2026-08-21T00:00:00Z', opted_out_at: null },
        { phone_number: '+12485550400', status: 'opted_out', consented_at: '2026-08-21T00:00:00Z', opted_out_at: '2026-08-21T01:00:00Z' },
      ],
      scopes: [
        { phone_number: '+12485550100', consent_scope: 'customer' },
        { phone_number: '+12485550200', consent_scope: 'crew' },
        { phone_number: '+12485550300', consent_scope: 'owner' },
        { phone_number: '+12485550400', consent_scope: 'customer' },
      ],
    }), 'acct-1');
    expect(result).toEqual({ kind: 'ready', data: ['+12485550100'] });
  });

  it('fails closed when base consent cannot be read', async () => {
    await expect(loadCurrentSmsConsentPhones(
      consentClient({ consent: null, consentError: { message: 'consent unavailable' } }),
      'acct-1',
    )).resolves.toEqual({ kind: 'unavailable', data: [] });
  });

  it('fails closed when customer audience scope cannot be read', async () => {
    await expect(loadCurrentSmsConsentPhones(
      consentClient({
        consent: [{
          phone_number: '+12485550100', status: 'opted_in',
          consented_at: '2026-08-21T00:00:00Z', opted_out_at: null,
        }],
        scopes: null,
        scopeError: { message: 'scope unavailable' },
      }),
      'acct-1',
    )).resolves.toEqual({ kind: 'unavailable', data: [] });
  });
});
