import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  applyTab,
  buildActivityView,
  computeKpis,
  filtersActive,
  inWindow,
  MAX_REMINDERS,
  normalizeDateRange,
  normalizeTab,
  prioritisePrivate,
  ratingDistribution,
  readFilters,
  reminderBlock,
  reminderBlockMessage,
  REMINDER_COOLDOWN_HOURS,
  requestStatus,
  responseRate,
  responseTrend,
  windowsFor,
  type ActivityRow,
} from '@/lib/review-activity';
import type { ReviewInviteRow } from '@/lib/review-routing';

/**
 * The Reviews Command Center's arithmetic.
 *
 * The centre of gravity here is the DENOMINATOR. The screen this replaced
 * divided the star breakdown by requests sent, so one 5★ reply to four asks
 * rendered "5★ · 25%" — the response rate wearing the distribution's clothes.
 * Several tests below exist only to make that specific number impossible to
 * bring back.
 */

const NOW = '2026-08-13T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(Date.parse(NOW) - n * 3_600_000).toISOString();

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: Math.random().toString(36).slice(2),
    jobId: 'job-1',
    jobRef: 'J-1041',
    clientId: 'client-1',
    clientName: 'Dana Whitfield',
    clientPhone: '+13135550142',
    clientEmail: 'dana@example.com',
    rating: null,
    feedback: null,
    status: 'awaiting',
    channel: 'sms',
    sentAt: daysAgo(3),
    respondedAt: null,
    googleClickedAt: null,
    feedbackAt: null,
    remindersSent: 0,
    lastRemindedAt: null,
    remindersStoppedAt: null,
    resolvedAt: null,
    ...over,
  };
}

/** A row that actually rated, with the derived status kept consistent. */
const rated = (stars: 1 | 2 | 3 | 4 | 5, over: Partial<ActivityRow> = {}) =>
  row({ rating: stars, status: 'rated', respondedAt: daysAgo(2), ...over });

function invite(over: Partial<ReviewInviteRow> = {}): ReviewInviteRow {
  return {
    id: 'i1',
    job_id: 'job-1',
    client_name: 'Dana',
    rating: null,
    feedback: null,
    google_clicked_at: null,
    feedback_at: null,
    responded_at: null,
    routed_to: null,
    ...over,
  };
}

/* ===========================================================================
   1. The bug this file exists to end
   ======================================================================== */
describe('the rating distribution divides by ratings received', () => {
  it('one 5★ out of four requests is 100% five-star, not 25%', () => {
    // The exact case from the brief. Four asks, one reply, and that reply was
    // five stars: 100% of the people who rated gave five stars. 25% is the
    // response rate, and it belongs on a different card.
    const bars = ratingDistribution({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 }, 1);
    expect(bars.find((b) => b.rating === 5)).toMatchObject({ count: 1, pct: 100 });
    // And the response rate — the number 25 actually describes — is separate.
    expect(responseRate(1, 4)).toBe(25);
  });

  it('splits the received ratings between them and totals 100', () => {
    const bars = ratingDistribution({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 }, 4);
    expect(bars.map((b) => `${b.rating}:${b.pct}`)).toEqual(['5:50', '4:25', '3:0', '2:0', '1:25']);
    expect(bars.reduce((sum, b) => sum + b.pct, 0)).toBe(100);
  });

  it('reports 0%, not a fake 100%, when nothing has been rated', () => {
    // `|| 1` in the denominator is the tempting way to dodge a division by
    // zero, and it turns "no data" into a real-looking number.
    for (const bar of ratingDistribution({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 0)) {
      expect(bar.pct).toBe(0);
    }
  });

  it('never lets the sent count reach the distribution through computeKpis', () => {
    // Four sent, one rated 5★ — the end-to-end version of the case above.
    const rows = [rated(5), row(), row(), row()];
    const kpis = computeKpis(rows, null);
    expect(kpis.sent).toBe(4);
    expect(kpis.rated).toBe(1);
    expect(kpis.distribution.find((b) => b.rating === 5)?.pct).toBe(100);
    expect(kpis.responseRate.value).toBe(25);
  });
});

describe('the response rate divides by requests sent', () => {
  it('is answered over asked', () => {
    expect(responseRate(3, 12)).toBe(25);
    expect(responseRate(12, 12)).toBe(100);
  });

  it('is null rather than 0% when nobody has been asked', () => {
    // 0% reads as "nobody replied". "We have not asked anybody" is a different
    // sentence and the card needs to be able to tell them apart.
    expect(responseRate(0, 0)).toBeNull();
  });
});

/* ===========================================================================
   2. Status
   ======================================================================== */
describe('one status per request', () => {
  it('reads silence as awaiting', () => {
    expect(requestStatus(invite())).toBe('awaiting');
  });

  it('reads a rating with no route taken as rated', () => {
    expect(requestStatus(invite({ rating: 4, responded_at: NOW }))).toBe('rated');
  });

  it('ranks both above either single route', () => {
    // The old routed_to column could not express this at all, which is half of
    // why removing the gate needed two timestamps.
    const bothWays = invite({ google_clicked_at: NOW, feedback_at: NOW, feedback: 'A note' });
    expect(requestStatus(bothWays)).toBe('both');
    expect(requestStatus(invite({ google_clicked_at: NOW }))).toBe('public');
    expect(requestStatus(invite({ feedback_at: NOW, feedback: 'A note' }))).toBe('private');
  });

  it('still counts pre-migration rows that only have routed_to', () => {
    // Reading the timestamps alone would silently zero every row written before
    // the 2026-08-03 migration.
    expect(requestStatus(invite({ routed_to: 'google' }))).toBe('public');
    expect(requestStatus(invite({ routed_to: 'private', feedback: 'Called me back' }))).toBe('private');
  });
});

/* ===========================================================================
   3. Windows and comparison
   ======================================================================== */
describe('date windows', () => {
  it('defaults to 30 days and rejects anything it does not recognise', () => {
    expect(normalizeDateRange(undefined)).toBe('30d');
    expect(normalizeDateRange('; drop table')).toBe('30d');
    expect(normalizeDateRange('90d')).toBe('90d');
  });

  it('puts the previous period immediately before the current one, same length', () => {
    const { current, previous } = windowsFor('30d', NOW);
    expect(current.days).toBe(30);
    expect(previous?.days).toBe(30);
    // No gap and no overlap: the previous window ends exactly where this starts.
    expect(previous?.to).toBe(current.from);
  });

  it('has no previous period for all time', () => {
    // There is no earlier data by definition, and comparing against zero would
    // report a triumphant +100% on every card.
    const { current, previous } = windowsFor('all', NOW);
    expect(previous).toBeNull();
    expect(current.from).toBeNull();
  });

  it('treats a null start as open-ended rather than as excluding everything', () => {
    const { current } = windowsFor('all', NOW);
    expect(inWindow('2019-01-01T00:00:00.000Z', current)).toBe(true);
    expect(inWindow(null, current)).toBe(false);
  });
});

describe('period comparison', () => {
  it('measures the same question over both windows', () => {
    const now = [rated(5), rated(5)];
    const before = [rated(3)];
    const kpis = computeKpis(now, before);
    expect(kpis.averageRating.value).toBe(5);
    expect(kpis.averageRating.previous).toBe(3);
    expect(kpis.averageRating.delta).toBe(2);
  });

  it('reports no delta rather than a fake one when there is no previous period', () => {
    const kpis = computeKpis([rated(5)], null);
    expect(kpis.averageRating.previous).toBeNull();
    expect(kpis.averageRating.delta).toBeNull();
  });

  it('compares the FILTERED past, not everything that ever happened', () => {
    // Through buildActivityView, which is where the two windows are chosen.
    const rows = [
      rated(5, { sentAt: daysAgo(5) }),
      rated(1, { sentAt: daysAgo(40) }),
      rated(1, { sentAt: daysAgo(200) }), // outside both 30-day windows
    ];
    const view = buildActivityView(rows, { range: '30d' }, NOW);
    expect(view.kpis.averageRating.value).toBe(5);
    expect(view.kpis.averageRating.previous).toBe(1);
  });
});

/* ===========================================================================
   4. Filters and tabs
   ======================================================================== */
describe('filters', () => {
  const rows = [
    rated(5, { clientName: 'Dana Whitfield', jobRef: 'J-1041', channel: 'sms' }),
    rated(2, { clientName: 'Marco Reyes', jobRef: 'J-1042', channel: 'email', status: 'private', feedback: 'Late', feedbackAt: daysAgo(1) }),
    row({ clientName: 'Priya Shah', jobRef: 'J-1043', channel: 'unknown' }),
  ];
  const { current } = windowsFor('30d', NOW);

  it('reads unknown values back as "any" instead of filtering everything out', () => {
    const filters = readFilters({ status: 'nonsense', rating: '9', channel: 'carrier-pigeon' });
    expect(filters.status).toBe('any');
    expect(filters.rating).toBe('any');
    expect(filters.channel).toBe('any');
  });

  it('searches the customer and the job, which is what an owner remembers', () => {
    expect(applyFilters(rows, { ...readFilters({}), search: 'reyes' }, current)).toHaveLength(1);
    expect(applyFilters(rows, { ...readFilters({}), search: 'J-1043' }, current)).toHaveLength(1);
    expect(applyFilters(rows, { ...readFilters({}), search: 'nobody' }, current)).toHaveLength(0);
  });

  it('filters by rating, status and channel', () => {
    expect(applyFilters(rows, { ...readFilters({}), rating: 5 }, current)).toHaveLength(1);
    expect(applyFilters(rows, { ...readFilters({}), status: 'awaiting' }, current)).toHaveLength(1);
    expect(applyFilters(rows, { ...readFilters({}), channel: 'email' }, current)).toHaveLength(1);
  });

  it('excludes anything outside the window even with no other filter set', () => {
    const old = [rated(5, { sentAt: daysAgo(400) })];
    expect(applyFilters(old, readFilters({}), current)).toHaveLength(0);
  });

  it('knows when it is narrowing, for the Clear control', () => {
    expect(filtersActive(readFilters({}))).toBe(false);
    expect(filtersActive(readFilters({ q: 'dana' }))).toBe(true);
    expect(filtersActive(readFilters({ range: 'all' }))).toBe(true);
  });

  it('caps the search string so a URL cannot carry an essay into a filter', () => {
    expect(readFilters({ q: 'x'.repeat(500) }).search).toHaveLength(80);
  });
});

describe('tabs', () => {
  const rows = [
    row({ status: 'public' }),
    row({ status: 'private', feedback: 'Late' }),
    row({ status: 'both', feedback: 'Mixed' }),
    row({ status: 'awaiting' }),
  ];

  it('counts someone who did both in BOTH tabs', () => {
    // They did each thing. A tab that hid them from one would be describing a
    // gate that no longer exists.
    expect(applyTab(rows, 'public')).toHaveLength(2);
    expect(applyTab(rows, 'private')).toHaveLength(2);
    expect(applyTab(rows, 'all')).toHaveLength(4);
  });

  it('falls back to all requests for an unknown tab', () => {
    expect(normalizeTab('spam')).toBe('all');
    expect(normalizeTab('private')).toBe('private');
  });
});

/* ===========================================================================
   5. Private feedback triage
   ======================================================================== */
describe('private feedback is ordered for triage, not gated', () => {
  it('puts the worst unresolved rating first and the oldest of a tie ahead', () => {
    const rows = [
      row({ id: 'b', rating: 3, status: 'private', feedbackAt: daysAgo(1) }),
      row({ id: 'a', rating: 1, status: 'private', feedbackAt: daysAgo(2) }),
      row({ id: 'c', rating: 1, status: 'private', feedbackAt: daysAgo(9) }),
    ];
    expect(prioritisePrivate(rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops anything already resolved below everything that is not', () => {
    const rows = [
      row({ id: 'handled', rating: 1, status: 'private', resolvedAt: NOW }),
      row({ id: 'open', rating: 4, status: 'private' }),
    ];
    expect(prioritisePrivate(rows).map((r) => r.id)).toEqual(['open', 'handled']);
  });

  it('does not mutate the array it was handed', () => {
    const rows = [row({ id: 'b', rating: 5 }), row({ id: 'a', rating: 1 })];
    prioritisePrivate(rows);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

/* ===========================================================================
   6. The trend
   ======================================================================== */
describe('the response trend', () => {
  it('is empty rather than a flat line of zeroes when nothing was sent', () => {
    // A chart of zeroes looks like a measurement. "We have not asked anybody"
    // is not one, and the caller renders an empty state instead.
    expect(responseTrend([], windowsFor('30d', NOW).current)).toEqual([]);
  });

  it('buckets by time and counts responses within each bucket', () => {
    const { current } = windowsFor('30d', NOW);
    const buckets = responseTrend([rated(5, { sentAt: daysAgo(1) }), row({ sentAt: daysAgo(1) })], current, 6);
    expect(buckets).toHaveLength(6);
    const totals = buckets.reduce((acc, b) => ({ sent: acc.sent + b.sent, responded: acc.responded + b.responded }), { sent: 0, responded: 0 });
    expect(totals).toEqual({ sent: 2, responded: 1 });
  });

  it('keeps a row landing exactly on the end of the window inside the last bucket', () => {
    // Math.floor on an exact boundary indexes one past the end of the array.
    const { current } = windowsFor('30d', NOW);
    const buckets = responseTrend([row({ sentAt: NOW })], current, 6);
    expect(buckets[5].sent).toBe(1);
  });
});

/* ===========================================================================
   7. Reminders — the only thing here that reaches a customer
   ======================================================================== */
describe('when a reminder is allowed', () => {
  const stale = { sentAt: daysAgo(10), lastRemindedAt: null };

  it('allows one when nobody has responded and the cooldown has passed', () => {
    expect(reminderBlock(row(stale), NOW)).toBeNull();
  });

  it('refuses once they have responded', () => {
    expect(reminderBlock(row({ ...stale, status: 'public' }), NOW)).toBe('already_responded');
    expect(reminderBlock(row({ ...stale, status: 'private' }), NOW)).toBe('already_responded');
  });

  it('refuses after three, because a fourth chase is not a reminder', () => {
    expect(reminderBlock(row({ ...stale, remindersSent: MAX_REMINDERS }), NOW)).toBe('limit_reached');
    expect(reminderBlock(row({ ...stale, remindersSent: MAX_REMINDERS - 1 }), NOW)).toBeNull();
  });

  it('refuses inside the cooldown, measured from the last reminder', () => {
    expect(reminderBlock(row({ ...stale, lastRemindedAt: hoursAgo(REMINDER_COOLDOWN_HOURS - 1) }), NOW)).toBe('too_soon');
    expect(reminderBlock(row({ ...stale, lastRemindedAt: hoursAgo(REMINDER_COOLDOWN_HOURS + 1) }), NOW)).toBeNull();
  });

  it('measures the cooldown from the original send when nothing has been resent', () => {
    expect(reminderBlock(row({ sentAt: hoursAgo(2) }), NOW)).toBe('too_soon');
  });

  it('refuses when the owner stopped reminders for this request', () => {
    expect(reminderBlock(row({ ...stale, remindersStoppedAt: daysAgo(1) }), NOW)).toBe('stopped');
  });

  it('refuses when there is nowhere to send it', () => {
    expect(reminderBlock(row({ ...stale, clientPhone: null, clientEmail: null }), NOW)).toBe('no_contact');
  });

  it('says which rule stopped it, so a disabled button is not just broken', () => {
    for (const block of ['already_responded', 'stopped', 'limit_reached', 'too_soon', 'no_contact'] as const) {
      expect(reminderBlockMessage(block, row({ remindersSent: 3 })), block).not.toBe('');
    }
    expect(reminderBlockMessage(null, row())).toBe('');
  });
});

/* ===========================================================================
   8. The assembled view
   ======================================================================== */
describe('buildActivityView', () => {
  const rows = [
    rated(5, { id: 'a', sentAt: daysAgo(2), status: 'public', googleClickedAt: daysAgo(2) }),
    rated(1, { id: 'b', sentAt: daysAgo(4), status: 'private', feedback: 'Left a mess', feedbackAt: daysAgo(3) }),
    row({ id: 'c', sentAt: daysAgo(6) }),
    rated(4, { id: 'old', sentAt: daysAgo(120) }),
  ];

  it('assembles counts, kpis and the visible rows from the URL alone', () => {
    const view = buildActivityView(rows, {}, NOW);
    expect(view.filters.range).toBe('30d');
    expect(view.tab).toBe('all');
    expect(view.counts).toEqual({ all: 3, public: 1, private: 1 });
    expect(view.visible.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(view.kpis.sent).toBe(3);
    expect(view.kpis.responded).toBe(2);
    expect(view.kpis.responseRate.value).toBe(67);
  });

  it('reports the all-time total separately, so an empty filter result is honest', () => {
    // "No requests match these filters" and "you have never asked anybody" are
    // different empty states and the page has to be able to tell them apart.
    const view = buildActivityView(rows, { q: 'nobody at all' }, NOW);
    expect(view.visible).toHaveLength(0);
    expect(view.totalEver).toBe(4);
  });

  it('narrows the table by tab without changing the KPI cards', () => {
    // The cards describe the window, not the tab. Recomputing them per tab
    // would make "Average rating" mean something different on each one.
    const all = buildActivityView(rows, {}, NOW);
    const priv = buildActivityView(rows, { tab: 'private' }, NOW);
    expect(priv.visible.map((r) => r.id)).toEqual(['b']);
    expect(priv.kpis.averageRating.value).toBe(all.kpis.averageRating.value);
  });

  it('counts unresolved private feedback for the needs-attention badge', () => {
    expect(buildActivityView(rows, {}, NOW).kpis.unresolvedPrivate).toBe(1);
    const handled = rows.map((r) => (r.id === 'b' ? { ...r, resolvedAt: NOW } : r));
    expect(buildActivityView(handled, {}, NOW).kpis.unresolvedPrivate).toBe(0);
  });
});
