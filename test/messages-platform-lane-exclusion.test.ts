import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countUnreadMessages, loadConversations } from '../src/lib/messages';

/**
 * The customer inbox must not show LGQ's own traffic.
 *
 * `sms_messages` is scoped by account_id alone, so when owner alerts began
 * sending on 2026-08-22 the contractor's own mobile appeared as a thread in
 * their customer inbox — with a "View customer" link, a Call button, and a
 * reply box explaining that customer replies need a dedicated number. None of
 * that describes a conversation between the contractor and the platform.
 *
 * These assert the FILTER ITSELF rather than filtered output, because the bug
 * that matters is the shape of the predicate: a bare NOT IN silently discards
 * every row whose sender_number_id is null, which is most of the contractor's
 * history.
 */
type Captured = { table: string; filter: string | null };

function client(platformIds: string[], captured: Captured[], opts: { laneError?: boolean } = {}): SupabaseClient {
  return {
    from(table: string) {
      const entry: Captured = { table, filter: null };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: () => {
          if (table === 'sms_sender_numbers') {
            chain.__result = opts.laneError
              ? { data: null, error: { message: 'lane list unavailable' } }
              : { data: platformIds.map((id) => ({ id })), error: null };
          } else if (table === 'sms_messages') {
            captured.push(entry);
            chain.__result = { data: [], error: null, count: 0 };
          } else {
            chain.__result = { data: [], error: null };
          }
          return chain;
        },
        eq: self,
        not: self,
        is: self,
        in: self,
        order: self,
        or: (filter: string) => { entry.filter = filter; return chain; },
        limit: () => Promise.resolve(chain.__result),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(chain.__result).then(resolve),
      });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const LANES = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

describe('platform-lane exclusion in the customer inbox', () => {
  it('KEEPS messages whose sender was never recorded', async () => {
    // THE BUG THIS PREVENTS. `NOT IN (...)` is NULL for a NULL column, so a
    // bare .not() would hide every legacy message with no sender_number_id —
    // silently emptying the contractor's inbox rather than tidying it.
    const captured: Captured[] = [];
    await loadConversations(client(LANES, captured), 'acct-1');

    const messageQueries = captured.filter((c) => c.table === 'sms_messages');
    expect(messageQueries.length).toBeGreaterThan(0);
    for (const q of messageQueries) {
      expect(q.filter, 'no platform-lane filter was applied').not.toBeNull();
      expect(q.filter).toContain('sender_number_id.is.null');
      expect(q.filter).toContain('sender_number_id.not.in.');
    }
  });

  it('names every platform lane in the filter', async () => {
    const captured: Captured[] = [];
    await loadConversations(client(LANES, captured), 'acct-1');
    const filter = captured.find((c) => c.table === 'sms_messages')?.filter ?? '';
    for (const id of LANES) expect(filter).toContain(id);
  });

  it('applies no filter at all when the account has no platform lanes', async () => {
    // An empty NOT IN () is a syntax error, and there is nothing to exclude.
    const captured: Captured[] = [];
    await loadConversations(client([], captured), 'acct-1');
    for (const q of captured.filter((c) => c.table === 'sms_messages')) {
      expect(q.filter).toBeNull();
    }
  });

  it('FAILS OPEN when the lane list cannot be read', async () => {
    // Showing one extra thread is cosmetic. Hiding the contractor's real
    // customer conversations because a lookup failed is not.
    const captured: Captured[] = [];
    await loadConversations(client(LANES, captured, { laneError: true }), 'acct-1');
    for (const q of captured.filter((c) => c.table === 'sms_messages')) {
      expect(q.filter).toBeNull();
    }
  });

  it('applies the SAME exclusion to the unread badge as to the list', async () => {
    // Otherwise the badge counts messages the list will not show, and the two
    // contradict each other on screen.
    const captured: Captured[] = [];
    await countUnreadMessages(client(LANES, captured), 'acct-1');
    const badge = captured.find((c) => c.table === 'sms_messages');
    expect(badge?.filter).toContain('sender_number_id.is.null');
    expect(badge?.filter).toContain('sender_number_id.not.in.');
  });
});
