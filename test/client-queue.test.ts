import { describe, it, expect } from 'vitest';
import {
  CLIENT_SORTS,
  CLIENT_STAGES,
  countMappedClients,
  matchesQuery,
  sortQueue,
  stageCounts,
  type QueueClient,
} from '@/lib/client-queue';
import { BAND_LABEL, FOLLOW_UP_BANDS, bandFor } from '@/lib/client-followup';
import { CLIENTS_VIEWS, DEFAULT_CLIENTS_VIEW, normalizeClientsView } from '@/lib/dashboard-views';

const TODAY = '2026-08-05';

function client(over: Partial<QueueClient> = {}): QueueClient {
  return {
    id: 'c1',
    name: 'Dana Whitfield',
    initials: 'DW',
    isRepeat: false,
    phone: '2485550117',
    phoneLabel: '(248) 555-0117',
    email: 'dana@example.com',
    address: '1418 S Main St, Royal Oak',
    jobCount: 2,
    jobsLabel: '2 jobs',
    totalValue: 4200,
    totalLabel: '$4,200',
    lastLabel: 'Jul 2026',
    nextJobAt: null,
    lastVisitAt: '2026-08-01',
    unscheduledJobs: 0,
    search: 'dana whitfield 2485550117 dana@example.com 1418 s main st, royal oak',
    ...over,
  };
}

describe('the stages are the page own bands, not a fifth set of words', () => {
  it('is exactly the follow-up bands, in their order', () => {
    expect(CLIENT_STAGES.map((s) => s.id)).toEqual(FOLLOW_UP_BANDS);
    for (const stage of CLIENT_STAGES) expect(stage.label).toBe(BAND_LABEL[stage.id]);
  });

  it('counts each customer into exactly one band', () => {
    const clients = [
      client({ id: 'booked', nextJobAt: '2026-08-08' }),
      client({ id: 'recent', lastVisitAt: '2026-08-01' }),
      client({ id: 'quiet', lastVisitAt: '2026-02-01' }),
      client({ id: 'never', lastVisitAt: null }),
    ];
    const counts = stageCounts(clients, TODAY);
    expect(counts.all).toBe(4);
    expect(counts.booked).toBe(1);
    expect(counts.recent).toBe(1);
    expect(counts.drifting).toBe(1);
    expect(counts.unbooked).toBe(1);
    expect(counts.booked + counts.recent + counts.drifting + counts.unbooked).toBe(counts.all);
  });

  // Somebody you are seeing on Thursday is not drifting, however long it has
  // been. This is client-followup's rule; the chips must not restate it wrongly.
  it('lets a booked visit beat a long silence', () => {
    expect(bandFor(client({ nextJobAt: '2026-08-08', lastVisitAt: '2024-01-01' }), TODAY)).toBe('booked');
  });
});

describe('search reads the same string the other views match on', () => {
  it('finds by name, phone, email or address', () => {
    expect(matchesQuery(client(), 'dana')).toBe(true);
    expect(matchesQuery(client(), '5550117')).toBe(true);
    expect(matchesQuery(client(), 'royal')).toBe(true);
  });

  it('requires every term', () => {
    expect(matchesQuery(client(), 'dana royal')).toBe(true);
    expect(matchesQuery(client(), 'dana pontiac')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(client(), '')).toBe(true);
  });
});

describe('the map count means mapped customers in the current queue', () => {
  it('drops pins outside the current filter and counts a customer once', () => {
    const clients = [client({ id: 'visible-a' }), client({ id: 'visible-b' })];
    const pins = [
      { clientId: 'visible-a' },
      { clientId: 'visible-a' },
      { clientId: 'filtered-out' },
    ];

    expect(countMappedClients(clients, pins)).toBe(1);
  });
});

describe('sorted by silence', () => {
  const booked = client({ id: 'booked', nextJobAt: '2026-08-20', lastVisitAt: '2026-01-01' });
  const recent = client({ id: 'recent', lastVisitAt: '2026-08-02' });
  const quiet = client({ id: 'quiet', lastVisitAt: '2026-03-01' });
  const quieter = client({ id: 'quieter', lastVisitAt: '2025-11-01' });
  const never = client({ id: 'never', lastVisitAt: null });

  // The whole point: every other view on this page orders by name or by money,
  // which makes somebody drifting away look identical to a happy customer.
  it('leads with the people going quiet', () => {
    const out = sortQueue([booked, recent, quiet, never], 'silence', TODAY);
    expect(out.map((c) => c.id)).toEqual(['quiet', 'never', 'recent', 'booked']);
  });

  it('puts the longest silence first inside the quiet band', () => {
    const out = sortQueue([quiet, quieter], 'silence', TODAY);
    expect(out.map((c) => c.id)).toEqual(['quieter', 'quiet']);
  });

  it('reads booked work soonest-first', () => {
    const soon = client({ id: 'soon', nextJobAt: '2026-08-06' });
    const later = client({ id: 'later', nextJobAt: '2026-09-30' });
    const out = sortQueue([later, soon], 'silence', TODAY);
    expect(out.map((c) => c.id)).toEqual(['soon', 'later']);
  });

  it('still offers the plain orders', () => {
    expect(CLIENT_SORTS.map((s) => s.id)).toEqual(['silence', 'name', 'billed', 'jobs']);
    expect(sortQueue([client({ id: 'b', name: 'Bea' }), client({ id: 'a', name: 'Ada' })], 'name', TODAY).map((c) => c.id))
      .toEqual(['a', 'b']);
    expect(sortQueue([client({ id: 'small', totalValue: 10 }), client({ id: 'big', totalValue: 9000 })], 'billed', TODAY).map((c) => c.id))
      .toEqual(['big', 'small']);
    expect(sortQueue([client({ id: 'one', jobCount: 1 }), client({ id: 'many', jobCount: 12 })], 'jobs', TODAY).map((c) => c.id))
      .toEqual(['many', 'one']);
  });

  it('never mutates the array it was given', () => {
    const clients = [client({ id: 'a' }), client({ id: 'b' })];
    sortQueue(clients, 'billed', TODAY);
    expect(clients.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('Clients opens on Smoothie', () => {
  it('is the default for anyone who has never chosen', () => {
    expect(DEFAULT_CLIENTS_VIEW).toBe('smoothie');
    expect(normalizeClientsView(undefined)).toBe('smoothie');
    expect(normalizeClientsView('')).toBe('smoothie');
  });

  it('keeps every view somebody may already have chosen', () => {
    for (const view of CLIENTS_VIEWS) expect(normalizeClientsView(view), view).toBe(view);
  });

  it('falls back rather than trusting a hand-edited cookie', () => {
    for (const junk of ['Smoothie', 'grid', '../../etc', 0, {}, []]) {
      expect(normalizeClientsView(junk), String(junk)).toBe(DEFAULT_CLIENTS_VIEW);
    }
  });
});
