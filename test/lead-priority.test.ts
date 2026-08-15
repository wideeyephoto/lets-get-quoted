import { describe, it, expect } from 'vitest';
import {
  OVERDUE_AFTER_DAYS,
  boardActions,
  isClosed,
  primaryAction,
  rankLeads,
  type PriorityLead,
} from '@/lib/lead-priority';
import { DEFAULT_COLUMNS, LOCKED_COLUMN, TABLE_COLUMNS, csvCell, normalizeColumns, toCsv } from '@/lib/lead-table';

const now = new Date('2026-08-05T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function lead(over: Partial<PriorityLead> = {}): PriorityLead {
  return {
    id: 'l1',
    name: 'Dana Whitfield',
    status: 'contacted',
    detail: 'Roof replacement',
    address: null,
    location: null,
    city: null,
    createdAt: daysAgo(1),
    score: 'warm',
    estimate: null,
    isUrgent: false,
    textOnly: false,
    phone: '2485550117',
    email: null,
    lastTouchAt: daysAgo(1),
    ...over,
  };
}

describe('closed leads are not work', () => {
  it('knows what closed means', () => {
    expect(isClosed({ status: 'won' })).toBe(true);
    expect(isClosed({ status: 'lost' })).toBe(true);
    expect(isClosed({ status: 'new' })).toBe(false);
  });

  // The old inbox sorted won and lost in with everything else, so the count at
  // the top was not a number of things to do.
  it('drops them from every group', () => {
    const out = rankLeads(
      [lead({ id: 'won', status: 'won' }), lead({ id: 'lost', status: 'lost' }), lead({ id: 'open', status: 'new' })],
      { now },
    );
    const ids = [...out.actNow, ...out.followUp, ...out.snoozed].map((entry) => entry.lead.id);
    expect(ids).toEqual(['open']);
  });

  it('drops them from the snoozed group too', () => {
    const out = rankLeads([], { now, snoozed: [lead({ id: 'won', status: 'won' })] });
    expect(out.snoozed).toEqual([]);
  });
});

describe('the priority order', () => {
  const needsResponse = lead({ id: 'new', status: 'new', score: 'low', createdAt: daysAgo(1), lastTouchAt: null });
  const overdue = lead({ id: 'overdue', status: 'contacted', score: 'hot', lastTouchAt: daysAgo(9) });
  const quoteWaiting = lead({ id: 'quote', status: 'quoted', score: 'hot', lastTouchAt: daysAgo(9) });
  const working = lead({ id: 'working', status: 'contacted', score: 'hot', lastTouchAt: daysAgo(1) });

  it('runs needs-response, overdue follow-up, quote awaiting action, then the rest', () => {
    const out = rankLeads([working, quoteWaiting, overdue, needsResponse], { now });
    expect(out.actNow.map((entry) => entry.lead.id)).toEqual(['new', 'overdue', 'quote']);
    expect(out.followUp.map((entry) => entry.lead.id)).toEqual(['working']);
  });

  // A cold lead nobody has answered still outranks a hot one in flight. Heat is
  // a property of a lead; it is not a queue position.
  it('beats heat with whose move it is', () => {
    const out = rankLeads([working, needsResponse], { now });
    expect(out.actNow[0].lead.id).toBe('new');
  });

  it('uses heat, then value, then waiting, inside a tier', () => {
    const out = rankLeads(
      [
        // Same tier and same day for all three, so only heat and value decide.
        lead({ id: 'warm-big', status: 'new', score: 'warm', estimate: { min: 9000, max: 12000 }, createdAt: daysAgo(1) }),
        lead({ id: 'hot-small', status: 'new', score: 'hot', estimate: { min: 10, max: 20 }, createdAt: daysAgo(1) }),
        lead({ id: 'hot-big', status: 'new', score: 'hot', estimate: { min: 5000, max: 8000 }, createdAt: daysAgo(1) }),
      ],
      { now },
    );
    expect(out.actNow.map((entry) => entry.lead.id)).toEqual(['hot-big', 'hot-small', 'warm-big']);
  });

  it('breaks a full tie with whoever has waited longest', () => {
    const out = rankLeads(
      [
        lead({ id: 'newer', status: 'new', score: 'hot', createdAt: daysAgo(1) }),
        lead({ id: 'older', status: 'new', score: 'hot', createdAt: daysAgo(9) }),
      ],
      { now },
    );
    expect(out.actNow.map((entry) => entry.lead.id)).toEqual(['older', 'newer']);
  });

  it('only calls a contacted lead overdue once it has actually gone quiet', () => {
    const fresh = rankLeads([lead({ status: 'contacted', lastTouchAt: daysAgo(OVERDUE_AFTER_DAYS - 1) })], { now });
    expect(fresh.actNow).toHaveLength(0);
    const stale = rankLeads([lead({ status: 'contacted', lastTouchAt: daysAgo(OVERDUE_AFTER_DAYS) })], { now });
    expect(stale.actNow).toHaveLength(1);
  });

  // A contacted lead with no logged touchpoint has to measure from somewhere,
  // and "when it arrived" is the only honest answer.
  it('falls back to the arrival date when nobody logged a touch', () => {
    const out = rankLeads([lead({ status: 'contacted', lastTouchAt: null, createdAt: daysAgo(30) })], { now });
    expect(out.actNow[0].tier).toBe('overdue-followup');
  });
});

describe('every result explains its placement', () => {
  it('reads back as the sentence in the brief', () => {
    const out = rankLeads(
      [lead({ status: 'new', score: 'hot', createdAt: daysAgo(4), lastTouchAt: null })],
      { now },
    );
    expect(out.actNow[0].reason).toBe('Needs response · Hot · waiting 4 days');
  });

  it('names the tier it was actually put in', () => {
    const out = rankLeads(
      [
        lead({ id: 'a', status: 'quoted', score: 'warm', lastTouchAt: daysAgo(10), createdAt: daysAgo(12) }),
        lead({ id: 'b', status: 'contacted', score: 'low', lastTouchAt: daysAgo(1), createdAt: daysAgo(2) }),
      ],
      { now },
    );
    expect(out.actNow[0].reason).toContain('Quote awaiting action');
    expect(out.followUp[0].reason).toContain('In the pipeline');
  });
});

describe('one context-aware primary action', () => {
  // The old inbox gave a Call button to a lead marked "Text only".
  it('never offers a call to a text-only lead', () => {
    expect(primaryAction(lead({ textOnly: true })).kind).toBe('text');
  });

  it('calls when a phone is on file and nobody objected', () => {
    expect(primaryAction(lead({ textOnly: false })).kind).toBe('call');
  });

  it('falls back to opening the lead when there is no phone at all', () => {
    const action = primaryAction(lead({ phone: null }));
    expect(action.kind).toBe('open');
    expect(action.href).toBe('/dashboard/leads/l1');
  });

  it('does not expose a call action for a partial imported phone number', () => {
    expect(primaryAction(lead({ phone: '74' })).kind).toBe('open');
  });
});

describe('board actions match the stage', () => {
  it('never offers Decline on a lead that is already closed', () => {
    expect(boardActions('won')).toEqual([]);
    expect(boardActions('lost')).toEqual([]);
  });

  it('offers what each open stage can actually do', () => {
    expect(boardActions('new')).toContain('contacted');
    expect(boardActions('new')).not.toContain('won');
    expect(boardActions('contacted')).toContain('quote');
    expect(boardActions('quoted')).toContain('won');
    expect(boardActions('quoted')).not.toContain('contacted');
  });
});

describe('the table column model', () => {
  it('defaults to the columns the brief asks for', () => {
    expect(DEFAULT_COLUMNS).toEqual(['lead', 'project', 'stage', 'waiting', 'value', 'source', 'next']);
  });

  it('never produces a table with no name column', () => {
    expect(normalizeColumns(['stage', 'value'])).toContain(LOCKED_COLUMN);
    expect(normalizeColumns([])).toEqual(DEFAULT_COLUMNS);
    expect(normalizeColumns('nonsense')).toEqual(DEFAULT_COLUMNS);
  });

  it('drops columns it does not know about', () => {
    expect(normalizeColumns(['lead', 'invented'])).toEqual(['lead']);
  });

  it('offers every default plus the optional extras', () => {
    const ids = TABLE_COLUMNS.map((c) => c.id);
    for (const extra of ['heat', 'location', 'received']) expect(ids).toContain(extra);
  });
});

describe('CSV export', () => {
  // Every address has a comma in it.
  it('quotes anything that would break a row', () => {
    expect(csvCell('1418 S Main St, Royal Oak')).toBe('"1418 S Main St, Royal Oak"');
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(null)).toBe('');
  });

  it('writes CRLF, because these get opened in Excel on Windows', () => {
    expect(toCsv(['A', 'B'], [['1', '2']])).toBe('A,B\r\n1,2');
  });
});
