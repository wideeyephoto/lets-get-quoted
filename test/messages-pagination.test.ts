import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadConversationMessages } from '@/lib/messages';

type Row = Record<string, unknown> & { id: string; created_at: string };
function rows(count: number, event = false): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${event ? 'event' : 'message'}-${String(index).padStart(5, '0')}`,
    account_id: 'account-1', phone_number: '+12125550123', direction: 'inbound',
    body: `body ${index}`, inbox_visible: true, provider_id: null, sender_number_id: null,
    status: 'queued', message_kind: 'inbox-reply',
    // Shared timestamps exercise stable ordering at page boundaries.
    created_at: '2026-09-05T12:00:00Z',
  }));
}
function database(messages: Row[], events: Row[] = [], cap = 1000, failTable?: string) {
  const requests: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const table = url.pathname.split('/').at(-1);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (table === failTable && offset > 0) return new Response(JSON.stringify({ code: '42501', message: 'read failed' }), { status: 403 });
    const source = table === 'sms_messages' ? messages : table === 'sms_events' ? events : [];
    const limit = Math.min(cap, Number(url.searchParams.get('limit') ?? cap));
    const data = source.slice(offset, offset + limit);
    return new Response(JSON.stringify(data), { status: 200, headers: {
      'content-type': 'application/json', 'content-range': `${offset}-${offset + data.length - 1}/${source.length}`,
    } });
  });
  return {
    client: createClient('https://test.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchMock },
    }), requests,
  };
}

describe('complete conversation pagination', () => {
  it.each([1000, 200])('includes the newest reply beyond 1,000 rows with API cap %s', async (cap) => {
    const { client, requests } = database(rows(1201), [], cap);
    const result = await loadConversationMessages(client, 'account-1', '+12125550123');
    expect(result.kind).toBe('ready');
    expect(result.data).toHaveLength(1201);
    expect(result.data.at(-1)?.id).toBe('message-01200');
    expect(new Set(result.data.map(({ id }) => id)).size).toBe(1201);
    for (const url of requests.filter((url) => url.pathname.endsWith('/sms_messages'))) {
      expect(url.searchParams.get('account_id')).toBe('eq.account-1');
      expect(url.searchParams.get('phone_number')).toBe('eq.+12125550123');
      expect(url.searchParams.get('inbox_visible')).toBe('eq.true');
      expect(url.searchParams.get('order')).toBe('created_at.asc,id.asc');
    }
  });
  it('paginates durable events and merges mirrored entries only once', async () => {
    const events = rows(1101, true);
    const { client } = database([{ ...events[0], direction: 'outbound', sms_event_id: events[0].id }], events);
    const result = await loadConversationMessages(client, 'account-1', '+12125550123');
    expect(result.kind).toBe('ready');
    expect(result.data).toHaveLength(1101);
    expect(result.data.at(-1)?.id).toBe('event-01100');
    expect(result.data.every((row) => row.delivery_status === 'queued')).toBe(true);
  });
  it.each(['sms_messages', 'sms_events'])('fails closed if a later %s page fails', async (table) => {
    const { client } = database(rows(601), rows(601, true), 500, table);
    expect(await loadConversationMessages(client, 'account-1', '+12125550123')).toEqual({ kind: 'unavailable', data: [] });
  });
});
