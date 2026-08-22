import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildContactIdentityMap, contactLabel, loadConversations } from '../src/lib/messages';

/**
 * What a conversation is CALLED.
 *
 * The inbox headed every thread with the phone number unless a job or a lead
 * happened to carry a name — the least recognisable thing we know about
 * somebody. Two separate faults sat behind that:
 *
 *  1. the contact lookup read jobs and leads but NOT clients, while the thread
 *     pane beside it reads clients — so one screen showed "810-304-2061" on the
 *     left and "BRETT" on the right, for the same conversation;
 *  2. there was no fallback at all between "has a name" and "is a number",
 *     though most rows carry an address.
 */

type Table = 'leads' | 'jobs' | 'clients' | 'sms_messages' | 'sms_events' | 'sms_sender_numbers';

function client(tables: Partial<Record<Table, unknown[]>>): SupabaseClient {
  const api = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: () => {
          chain.__result = { data: tables[table as Table] ?? [], error: null };
          return chain;
        },
        eq: self, not: self, order: self, in: self, or: self,
        limit: () => Promise.resolve(chain.__result),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(chain.__result).then(resolve),
      });
      return chain;
    },
  };
  return api as unknown as SupabaseClient;
}

const PHONE = '+12485550100';

describe('contactLabel', () => {
  it('uses the name when there is one', () => {
    expect(contactLabel({ name: 'Dana Whitfield', address: '1418 Maplewood Ave, Royal Oak' }, PHONE))
      .toBe('Dana Whitfield');
  });

  it('falls back to the street, then the town, then the number', () => {
    // The order the owner would ask in: who, then where exactly, then which
    // town, and the number only when we genuinely know nothing else.
    expect(contactLabel({ name: null, address: '1418 Maplewood Ave, Royal Oak, MI 48067' }, PHONE))
      .toBe('1418 Maplewood Ave');
    expect(contactLabel({ name: null, address: 'Royal Oak, MI 48067' }, PHONE)).toBe('Royal Oak');
    expect(contactLabel({ name: null, address: null }, PHONE)).toBe('248-555-0100');
    expect(contactLabel(null, PHONE)).toBe('248-555-0100');
  });

  it('does not treat whitespace as a name', () => {
    // An imported row with an empty name column would otherwise head the thread
    // with a blank string and no way to tell which conversation it is.
    expect(contactLabel({ name: '   ', address: 'Royal Oak, MI' }, PHONE)).toBe('Royal Oak');
    expect(contactLabel({ name: '', address: null }, PHONE)).toBe('248-555-0100');
  });

  it('never returns an empty string', () => {
    for (const identity of [null, { name: null, address: null }, { name: ' ', address: ' ' }]) {
      expect(contactLabel(identity, PHONE).length).toBeGreaterThan(0);
    }
  });
});

describe('buildContactIdentityMap', () => {
  it('reads the address book, which is what the thread pane already reads', async () => {
    // THE REGRESSION. A customer who exists only as a client was a bare phone
    // number in the list and a full name in the panel beside it.
    const map = await buildContactIdentityMap(
      client({ clients: [{ name: 'Brett', phone: '(248) 555-0100', address: null }] }),
      'acct',
    );
    expect(map.get(PHONE)).toEqual({ name: 'Brett', address: null });
  });

  it('lets the address book win over a job, and a job over a lead', async () => {
    const map = await buildContactIdentityMap(
      client({
        leads: [{ name: 'D. Whitfield', phone: PHONE, address: null }],
        jobs: [{ client_name: 'Dana W', client_phone: PHONE, address: null }],
        clients: [{ name: 'Dana Whitfield', phone: PHONE, address: null }],
      }),
      'acct',
    );
    expect(map.get(PHONE)?.name).toBe('Dana Whitfield');
  });

  it('merges field by field, so an address does not erase a name', async () => {
    // A job carrying a service address but no usable name must not blank out
    // the name the lead supplied, or the row would fall back to the street when
    // we know perfectly well who it is.
    const map = await buildContactIdentityMap(
      client({
        leads: [{ name: 'Dana Whitfield', phone: PHONE, address: null }],
        jobs: [{ client_name: null, client_phone: PHONE, address: '1418 Maplewood Ave, Royal Oak' }],
      }),
      'acct',
    );
    expect(map.get(PHONE)).toEqual({ name: 'Dana Whitfield', address: '1418 Maplewood Ave, Royal Oak' });
  });

  it('keys on the normalised number, not the stored string', async () => {
    // The book holds "(248) 555-0100" and the webhook delivers "+12485550100".
    const map = await buildContactIdentityMap(
      client({ clients: [{ name: 'Brett', phone: '248-555-0100', address: null }] }),
      'acct',
    );
    expect(map.has(PHONE)).toBe(true);
  });
});

describe('a labelled conversation', () => {
  const conversation = async (tables: Partial<Record<Table, unknown[]>>) => {
    const read = await loadConversations(
      client({
        sms_messages: [{
          phone_number: PHONE, body: 'Hello, this is a test',
          direction: 'inbound', created_at: '2026-08-22T20:27:00Z', read_at: null, media_urls: null,
        }],
        ...tables,
      }),
      'acct',
    );
    return read.data[0];
  };

  it('is headed by the street when nobody has typed a name', async () => {
    const found = await conversation({
      clients: [{ name: null, phone: PHONE, address: '1418 Maplewood Ave, Royal Oak, MI 48067' }],
    });
    expect(found.label).toBe('1418 Maplewood Ave');
  });

  it('keeps `name` a REAL name beside the label', async () => {
    // starterRepliesFor() greets by first name. If the street were written into
    // `name` to save a field, every saved reply would open "Hi 1418".
    const found = await conversation({
      clients: [{ name: null, phone: PHONE, address: '1418 Maplewood Ave, Royal Oak' }],
    });
    expect(found.name).toBeNull();
    expect(found.label).not.toBe(found.name);
  });

  it('still falls all the way back to the number', async () => {
    const found = await conversation({});
    expect(found.label).toBe('248-555-0100');
  });
});

describe('the inbox page uses the label without greeting by it', () => {
  const page = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'messages', 'page.tsx'),
    'utf8',
  );

  it('heads each row with the label rather than the raw number', () => {
    expect(page).toContain('const name = conversation.label;');
  });

  it('greets with the name, never the label', () => {
    // The whole reason `name` and `label` are separate fields.
    expect(page).toContain('starterRepliesFor(activeName)');
    expect(page).not.toContain('starterRepliesFor(activeLabel)');
  });

  it('still shows the number under a heading that is not the number', () => {
    // Keyed off the label, not the name: a street-headed thread would otherwise
    // lose the phone number from the screen entirely.
    expect(page).toContain('activeLabel !== formatPhoneDashes(activePhone)');
    expect(page).toContain('{namedHeading ? formatPhoneDashes(activePhone) : null}');
  });

  it('searches what the row actually shows', () => {
    expect(page).toContain('const label = conversation.label.toLowerCase();');
    expect(page).toContain('label.includes(query)');
  });
});
