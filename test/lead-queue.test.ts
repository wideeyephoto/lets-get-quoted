import { describe, it, expect } from 'vitest';
import {
  QUEUE_STAGES,
  contactPlan,
  isContactablePhone,
  matchesQuery,
  matchesStage,
  queueStageLabel,
  sortQueue,
  stageCounts,
  waitingFor,
  waitingLabel,
  type QueueLead,
} from '@/lib/lead-queue';
import { DEFAULT_LEADS_VIEW, LEADS_VIEWS, normalizeLeadsView } from '@/lib/dashboard-views';

const now = new Date('2026-08-05T12:00:00Z');
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600_000).toISOString();

function lead(over: Partial<QueueLead> = {}): QueueLead {
  return {
    id: 'l1',
    name: 'Dana Whitfield',
    status: 'new',
    detail: 'Roof replacement',
    address: '1418 S Main St, Royal Oak, MI',
    location: 'Royal Oak',
    city: 'Royal Oak',
    createdAt: hoursAgo(4),
    score: 'warm',
    estimate: { min: 900, max: 1800 },
    isUrgent: false,
    ...over,
  };
}

describe('one set of stages and counts', () => {
  it('names every stage the filter offers', () => {
    for (const stage of QUEUE_STAGES) {
      expect(queueStageLabel(stage.id)).toBe(stage.label);
    }
  });

  // The old label switched on the SOURCE, so a lead phoned in an hour ago sat
  // in the Needs-response bucket while its own badge read "New request".
  it('calls a new lead "Needs response" whatever it came in on', () => {
    expect(queueStageLabel('new')).toBe('Needs response');
  });

  it('counts every stage, including the empty ones', () => {
    const counts = stageCounts([lead({ id: 'a' }), lead({ id: 'b', status: 'won' })]);
    expect(counts).toEqual({ all: 2, open: 1, closed: 1, new: 1, contacted: 0, quoted: 0, won: 1, lost: 0 });
  });

  // The property that matters: the chips can never add up to something other
  // than the list they sit above.
  it('the stage counts sum to the total', () => {
    const leads = [
      lead({ id: 'a', status: 'new' }),
      lead({ id: 'b', status: 'contacted' }),
      lead({ id: 'c', status: 'quoted' }),
      lead({ id: 'd', status: 'quoted' }),
      lead({ id: 'e', status: 'lost' }),
    ];
    const counts = stageCounts(leads);
    const summed = QUEUE_STAGES.reduce((total, stage) => total + counts[stage.id], 0);
    expect(summed).toBe(counts.all);
    expect(counts.all).toBe(leads.length);
    expect(counts.open).toBe(4);
    expect(counts.closed).toBe(1);
  });

  it('groups operational work separately from closed reference records', () => {
    expect(matchesStage(lead({ status: 'new' }), 'open')).toBe(true);
    expect(matchesStage(lead({ status: 'quoted' }), 'open')).toBe(true);
    expect(matchesStage(lead({ status: 'won' }), 'open')).toBe(false);
    expect(matchesStage(lead({ status: 'won' }), 'closed')).toBe(true);
    expect(matchesStage(lead({ status: 'lost' }), 'closed')).toBe(true);
    expect(matchesStage(lead({ status: 'contacted' }), 'closed')).toBe(false);
  });
});

describe('search', () => {
  it('finds a lead by customer, by project and by town', () => {
    const row = lead();
    expect(matchesQuery(row, 'dana')).toBe(true);
    expect(matchesQuery(row, 'roof')).toBe(true);
    expect(matchesQuery(row, 'royal oak')).toBe(true);
  });

  // "royal oak roof" should find the roof job in Royal Oak, not everything in
  // either — so every term has to land somewhere.
  it('requires every term to match', () => {
    const row = lead();
    expect(matchesQuery(row, 'roof royal')).toBe(true);
    expect(matchesQuery(row, 'roof detroit')).toBe(false);
  });

  it('an empty search matches everything', () => {
    expect(matchesQuery(lead(), '   ')).toBe(true);
  });
});

describe('sorting', () => {
  const hot = lead({ id: 'hot', score: 'hot', createdAt: hoursAgo(2), estimate: { min: 100, max: 200 } });
  const oldWarm = lead({ id: 'old', score: 'warm', createdAt: hoursAgo(200), estimate: { min: 5000, max: 9000 } });
  const newLow = lead({ id: 'new', score: 'low', createdAt: hoursAgo(1), estimate: null });

  it('puts the hottest first on priority', () => {
    expect(sortQueue([newLow, oldWarm, hot], 'priority').map((l) => l.id)).toEqual(['hot', 'old', 'new']);
  });

  it('breaks a heat tie with whoever has waited longest', () => {
    const a = lead({ id: 'a', score: 'hot', createdAt: hoursAgo(2) });
    const b = lead({ id: 'b', score: 'hot', createdAt: hoursAgo(50) });
    expect(sortQueue([a, b], 'priority').map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('puts an unanswered website request ahead of an answered one of the same heat', () => {
    const answered = lead({ id: 'answered', score: 'hot', createdAt: hoursAgo(5), isUrgent: false });
    const waiting = lead({ id: 'waiting', score: 'hot', createdAt: hoursAgo(5), isUrgent: true });
    expect(sortQueue([answered, waiting], 'priority')[0].id).toBe('waiting');
  });

  it('orders by wait, by recency and by value', () => {
    expect(sortQueue([hot, oldWarm, newLow], 'waiting')[0].id).toBe('old');
    expect(sortQueue([hot, oldWarm, newLow], 'newest')[0].id).toBe('new');
    expect(sortQueue([hot, oldWarm, newLow], 'value')[0].id).toBe('old');
  });

  // "We don't know what it's worth" is not "it's worth nothing" — a page of
  // unestimated leads above the $9k one would be actively misleading.
  it('sinks leads with no estimate to the bottom of the value sort', () => {
    expect(sortQueue([newLow, hot], 'value').map((l) => l.id)).toEqual(['hot', 'new']);
  });

  it('never mutates the array it was given', () => {
    const input = [newLow, hot];
    sortQueue(input, 'priority');
    expect(input.map((l) => l.id)).toEqual(['new', 'hot']);
  });

  it('holds still when two leads tie completely', () => {
    const a = lead({ id: 'aaa' });
    const b = lead({ id: 'bbb' });
    expect(sortQueue([b, a], 'priority').map((l) => l.id)).toEqual(['aaa', 'bbb']);
  });
});

describe('waiting time reads as time', () => {
  // "94h" is a number nobody converts in their head, and it reads like a code.
  it('says days once hours stop being useful', () => {
    expect(waitingLabel(hoursAgo(94), now).long).toBe('4 days waiting');
    expect(waitingLabel(hoursAgo(94), now).short).toBe('4d waiting');
  });

  it('keeps hours while hours are still readable', () => {
    expect(waitingLabel(hoursAgo(6), now).long).toBe('6 hours waiting');
    expect(waitingLabel(hoursAgo(1), now).long).toBe('1 hour waiting');
  });

  it('counts minutes under the hour, and never says zero', () => {
    expect(waitingLabel(new Date(now.getTime() - 90_000).toISOString(), now).long).toBe('2 minutes waiting');
    expect(waitingLabel(now.toISOString(), now).long).toBe('1 minute waiting');
  });

  it('always carries a unit AND a noun', () => {
    for (const h of [0.1, 3, 40, 300]) {
      expect(waitingLabel(hoursAgo(h), now).short).toMatch(/waiting$/);
    }
  });

  it('does not invent a number from a broken date', () => {
    expect(waitingLabel('not-a-date', now).long).toBe('Waiting time unknown');
  });
});

/**
 * A closed lead is not waiting on anything.
 *
 * waitingLabel measures from created_at and never stops, so a lead won months
 * ago still read "12 minutes waiting" — printed beside its own Won badge, in a
 * column the queue sorts by. The clock has to stop where the pipeline does.
 */
describe('the waiting clock stops when the lead closes', () => {
  const at = (status: QueueLead['status']) => waitingFor({ status, createdAt: hoursAgo(94) }, now);

  it('says nothing for a won lead', () => {
    expect(at('won')).toBeNull();
  });

  it('says nothing for a lost one either', () => {
    expect(at('lost')).toBeNull();
  });

  it('and is unchanged for everybody still in the pipeline', () => {
    for (const status of ['new', 'contacted', 'quoted'] as const) {
      expect(at(status)).toEqual(waitingLabel(hoursAgo(94), now));
    }
  });

  it('returns null rather than an empty string, so no render site can print a blank by accident', () => {
    // Every consumer has to decide what to show instead — the detail pane shows
    // the lead's age, the rows show nothing, the CSV cell is empty.
    expect(at('won')).not.toBe('');
  });
});

describe('the contact preference decides the primary action', () => {
  it('makes text primary and demotes the call for a text-only lead', () => {
    const plan = contactPlan({ textOnly: true, hasPhone: true, hasEmail: false });
    expect(plan.primary).toBe('text');
    expect(plan.callLabel).toBe('Call only if needed');
    expect(plan.note).toMatch(/texted, not called/);
  });

  it('leaves a call primary when nobody asked otherwise', () => {
    const plan = contactPlan({ textOnly: false, hasPhone: true, hasEmail: true });
    expect(plan.primary).toBe('call');
    expect(plan.callLabel).toBe('Call');
  });

  it('does not point at a phone that is not on file', () => {
    const plan = contactPlan({ textOnly: false, hasPhone: false, hasEmail: true });
    expect(plan.primary).toBe('email');
    expect(plan.note).toMatch(/No phone on file/);
  });

  it('does not turn partial phone data into a call action', () => {
    expect(isContactablePhone('74')).toBe(false);
    expect(isContactablePhone('(248) 555-0199')).toBe(true);
    expect(isContactablePhone(null)).toBe(false);
  });

  it('falls back to email when text was requested but no usable phone exists', () => {
    const plan = contactPlan({ textOnly: true, hasPhone: false, hasEmail: true });
    expect(plan.primary).toBe('email');
    expect(plan.note).toMatch(/no usable mobile number/i);
  });
});

describe('the Leads view cookie', () => {
  it('opens new accounts on Smoothie', () => {
    expect(DEFAULT_LEADS_VIEW).toBe('smoothie');
    expect(normalizeLeadsView(undefined)).toBe('smoothie');
    expect(normalizeLeadsView('')).toBe('smoothie');
    expect(normalizeLeadsView('nonsense')).toBe('smoothie');
  });

  it('keeps the three purposeful layout choices', () => {
    for (const view of LEADS_VIEWS) {
      expect(normalizeLeadsView(view)).toBe(view);
    }
  });

  it('migrates overlapping legacy layouts to the consolidated Inbox', () => {
    for (const view of ['inbox', 'split', 'focus']) {
      expect(normalizeLeadsView(view)).toBe('smoothie');
      expect(LEADS_VIEWS).not.toContain(view);
    }
  });
});
