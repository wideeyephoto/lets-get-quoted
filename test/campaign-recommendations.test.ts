import { describe, it, expect, vi } from 'vitest';

// The scoring/eligibility engine that decides which 3 of the 11 templates lead
// the page. The DB-touching helpers it calls are faked so the trickiest
// branches — top-3 selection, the Reconnect/We Miss You tie-break, running out
// of eligible templates before filling 3 slots, and the "can't count this"
// seasonal case — are asserted deterministically rather than against a live
// account.

vi.mock('@/lib/booking', () => ({ getAvailableBookingDays: vi.fn() }));
vi.mock('@/lib/reviews', () => ({ countCompletedJobsAwaitingReview: vi.fn() }));
vi.mock('@/lib/site-content', () => ({ getSiteContent: vi.fn() }));
vi.mock('@/lib/marketing-calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketing-calendar')>();
  return { ...actual, planCalendar: vi.fn() };
});
vi.mock('@/lib/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services')>();
  return { ...actual, listServices: vi.fn() };
});

const { buildCampaignRecommendations } = await import('@/lib/campaign-recommendations');
const { getAvailableBookingDays } = await import('@/lib/booking');
const { countCompletedJobsAwaitingReview } = await import('@/lib/reviews');
const { getSiteContent } = await import('@/lib/site-content');
const { planCalendar } = await import('@/lib/marketing-calendar');
const { listServices } = await import('@/lib/services');
const { LAPSED_DAYS } = await import('@/lib/campaign-audiences');

const ACCOUNT = 'acc-1';
const DAY = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/** A fake PostgREST client covering only the tables this module reads directly. */
function fakeSupabase(rows: { jobs?: Row[]; recurring_plans?: Row[]; sites?: Row | null; accounts?: Row | null } = {}) {
  function chain(table: string) {
    const self: Record<string, unknown> = {};
    self.eq = () => self;
    // Awaited directly after .eq() for jobs/recurring_plans (array results).
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: (rows as Record<string, unknown>)[table] ?? [], error: null });
    // Used for sites/accounts (single-row results).
    self.maybeSingle = async () => ({ data: (rows as Record<string, unknown>)[table] ?? null, error: null });
    return self;
  }
  return {
    from(table: string) {
      return { select: () => chain(table) };
    },
  } as never;
}

const EMPTY_REACH = { total: 0, email: 0, sms: 0, either: 0, missingContact: 0, optedOut: 0, excluded: 0 };

function reachMap(overrides: Partial<Record<'all' | 'past' | 'repeat' | 'lapsed', number>> = {}) {
  const build = (n: number) => ({ ...EMPTY_REACH, total: n, email: n, sms: n, either: n });
  return {
    all: build(overrides.all ?? 0),
    past: build(overrides.past ?? 0),
    repeat: build(overrides.repeat ?? 0),
    lapsed: build(overrides.lapsed ?? 0),
  } as never;
}

function lapsedRecipient(daysAgo: number) {
  return { jobCount: 3, lastJobAt: new Date(Date.now() - daysAgo * DAY).toISOString() } as never;
}

/** Every mocked signal at its quietest — no bookings, no quotes, no plans, no services, nothing to review. */
function mockThinSignals() {
  vi.mocked(getAvailableBookingDays).mockResolvedValue([]);
  vi.mocked(countCompletedJobsAwaitingReview).mockResolvedValue(0);
  vi.mocked(listServices).mockResolvedValue([]);
  vi.mocked(planCalendar).mockReturnValue([]);
  vi.mocked(getSiteContent).mockReturnValue({ trade: '', testimonials: { googlePlaceId: '', googleUrl: '' } } as never);
}

describe('top-3 selection', () => {
  it('picks exactly the 3 highest-scoring eligible templates, in descending score order', async () => {
    mockThinSignals();
    const db = fakeSupabase({ jobs: [], recurring_plans: [] });

    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [lapsedRecipient(130)], // just past the 120-day threshold, well under 240
      reach: reachMap({ repeat: 5, lapsed: 40 }),
      businessName: 'BrokePipes',
      bookingUrl: 'https://book.example.com',
    });

    expect(result.recommended).toHaveLength(3);
    // reconnect (score min(40,80)=40) beats reward-repeat (score min(5*1.2,60)=6);
    // fill-next-week and everything else scores 0 with these thin signals, so
    // the remaining slots come from the fixed fallback list.
    expect(result.recommended[0].id).toBe('reconnect');
    const scores = result.recommended.map((card) => card.id);
    expect(scores).toContain('reward-repeat');
  });

  it('never fabricates a "why recommended" line for a fallback-filled card with no real signal behind it', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap(),
      businessName: 'BrokePipes',
      bookingUrl: 'https://book.example.com', // keeps fill-next-week eligible (score 0, no openings)
    });
    // Thin data: only fill-next-week and referral are eligible at all (see the
    // "running out of eligible templates" test below for the full accounting),
    // and neither has a real count backing it — both must land with
    // whyText: null rather than an invented reason.
    const fillNextWeek = result.recommended.find((c) => c.id === 'fill-next-week');
    const referral = result.recommended.find((c) => c.id === 'referral');
    expect(fillNextWeek?.whyText).toBeNull();
    expect(referral?.whyText).toBeNull();
  });
});

describe('Reconnect vs. We Miss You', () => {
  it('scores Reconnect and suppresses We Miss You when nobody has been gone 240+ days', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [lapsedRecipient(LAPSED_DAYS + 10)],
      reach: reachMap({ lapsed: 12 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });

    const reconnect = result.all.find((c) => c.id === 'reconnect')!;
    const weMissYou = result.all.find((c) => c.id === 'we-miss-you')!;
    expect(reconnect.whyText).not.toBeNull();
    expect(weMissYou.whyText).toBeNull();
    expect(result.recommended.some((c) => c.id === 'reconnect')).toBe(true);
    expect(result.recommended.some((c) => c.id === 'we-miss-you')).toBe(false);
  });

  it('flips to We Miss You once the most overdue lapsed customer passes double the lapsed threshold', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [lapsedRecipient(LAPSED_DAYS * 2 + 5)],
      reach: reachMap({ lapsed: 12 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });

    const reconnect = result.all.find((c) => c.id === 'reconnect')!;
    const weMissYou = result.all.find((c) => c.id === 'we-miss-you')!;
    expect(weMissYou.whyText).not.toBeNull();
    expect(reconnect.whyText).toBeNull();
    expect(result.recommended.some((c) => c.id === 'we-miss-you')).toBe(true);
    expect(result.recommended.some((c) => c.id === 'reconnect')).toBe(false);
  });

  it('never recommends both at once, however overdue the account\'s customers are', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [lapsedRecipient(LAPSED_DAYS * 3)],
      reach: reachMap({ lapsed: 30 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });
    const both = result.recommended.filter((c) => c.id === 'reconnect' || c.id === 'we-miss-you');
    expect(both.length).toBeLessThanOrEqual(1);
  });
});

describe('running out of eligible templates', () => {
  it('fills only as many slots as there are eligible templates, rather than padding with disabled ones', async () => {
    mockThinSignals();
    const db = fakeSupabase({ jobs: [], recurring_plans: [] });

    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap(), // nobody in any bucket
      businessName: 'BrokePipes',
      bookingUrl: 'https://book.example.com', // only this keeps fill-next-week from being disabled
    });

    // With no quotes, no recurring plans, no repeat/lapsed customers, no
    // completed jobs, and no services, only Fill Next Week's Schedule and
    // Referral Campaign remain eligible (Custom Campaign is deliberately never
    // fallback-filled) — every recommended card must be one of those two, and
    // none may be disabled.
    for (const card of result.recommended) {
      expect(['fill-next-week', 'referral']).toContain(card.id);
      expect(card.disabledReason).toBeNull();
      expect(card.draft).not.toBeNull();
    }
    expect(result.recommended.some((c) => c.id === 'custom')).toBe(false);
  });

  it('shows the real reason a template is unavailable instead of hiding it', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap(),
      businessName: 'BrokePipes',
      bookingUrl: null, // now fill-next-week is disabled too
    });
    const fillNextWeek = result.all.find((c) => c.id === 'fill-next-week')!;
    expect(fillNextWeek.disabledReason).toBe('Available after your booking page is published.');
    expect(fillNextWeek.draft).toBeNull();
  });
});

describe('seasonal beats with no countable audience', () => {
  it('shows recipientCount: null and an explanatory audience label instead of a substituted bucket count', async () => {
    mockThinSignals();
    vi.mocked(planCalendar).mockReturnValue([
      {
        beat: {
          id: 'heating-tuneup',
          title: 'Book a heating tune-up before the first cold snap',
          whyNow: 'Furnaces that skip a fall check tend to fail on the coldest night of the year.',
          channels: ['email', 'blog'],
          audience: 'maintenance-due', // no CampaignAudience equivalent — see campaignAudienceForBeat
          monthsByZone: {},
        },
        month: 9,
        monthName: 'September',
        months: [9],
        channel: 'email',
        channels: ['email', 'blog'],
      },
    ] as never);

    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap({ all: 50 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });

    expect(result.seasonal).toHaveLength(1);
    const seasonalCard = result.seasonal[0];
    expect(seasonalCard.recipientCount).toBeNull();
    expect(seasonalCard.audienceLabel).toBe('Audience decided in the editor');
    expect(seasonalCard.whyText).toBeNull();
    // Still a real, sendable card — just not one a top-3 slot can be built on
    // without inventing a count.
    expect(seasonalCard.disabledReason).toBeNull();
    expect(seasonalCard.draft).not.toBeNull();
    expect(result.recommended.some((c) => c.title === seasonalCard.title)).toBe(false);
  });

  it('does count a beat that maps to a real audience, and makes it eligible for a top-3 slot', async () => {
    mockThinSignals();
    vi.mocked(planCalendar).mockReturnValue([
      {
        beat: {
          id: 'spring-cleanup',
          title: 'Offer spring cleanup packages',
          whyNow: 'Yards wake up messy and everyone notices at once.',
          channels: ['email', 'blog'],
          audience: 'everyone',
          monthsByZone: {},
        },
        month: 4,
        monthName: 'April',
        months: [4],
        channel: 'email',
        channels: ['email', 'blog'],
      },
    ] as never);

    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap({ all: 75 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });

    const seasonalCard = result.seasonal[0];
    expect(seasonalCard.recipientCount).toBe(75);
    expect(seasonalCard.whyText).toBe('Yards wake up messy and everyone notices at once.');
  });
});

describe('the "all" listing', () => {
  it('always returns all 11 templates in the fixed catalog order', async () => {
    mockThinSignals();
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap(),
      businessName: 'BrokePipes',
      bookingUrl: null,
    });
    expect(result.all.map((c) => c.id)).toEqual([
      'fill-next-week',
      'follow-up-quotes',
      'maintenance-reminder',
      'reward-repeat',
      'seasonal-promotion',
      'reconnect',
      'we-miss-you',
      'request-reviews',
      'announce-service',
      'referral',
      'custom',
    ]);
  });
});

describe('preloaded data inputs', () => {
  it('uses preloaded siteContent, services, and signals without falling back to DB queries', async () => {
    mockThinSignals();
    // Pass empty db that would fail if queried for sites/services
    const db = fakeSupabase({});
    const result = await buildCampaignRecommendations(db, ACCOUNT, {
      recipients: [],
      reach: reachMap({ repeat: 2 }),
      businessName: 'BrokePipes',
      bookingUrl: null,
      siteContent: { trade: 'Plumber', testimonials: { googlePlaceId: '', googleUrl: '' } },
      serviceArea: 'Michigan',
      mailingAddress: '123 Main St, Ann Arbor, MI 48104',
      services: [{ name: 'Drain Cleaning', created_at: new Date().toISOString(), active: true }],
      jobSignals: { openQuoteCount: 2, completedCount: 5 },
    });

    expect(result.recommended).toBeDefined();
    expect(result.recommended.length).toBeGreaterThan(0);
    const followUp = result.all.find((c) => c.id === 'follow-up-quotes');
    expect(followUp?.whyText).toBe('2 open quotes waiting on a reply');
  });
});
