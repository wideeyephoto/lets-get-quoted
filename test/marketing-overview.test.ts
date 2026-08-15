import { describe, expect, it } from 'vitest';
import {
  chooseOverviewPriority,
  overviewSummary,
  prepareRecommendation,
  prepareRecommendations,
  type Recommendation,
} from '@/lib/marketing-overview';

function beat(over: Partial<Recommendation> = {}): Recommendation {
  return {
    beatId: 'first-cold-snap',
    title: 'Book a heating tune-up before the first cold snap',
    whyNow: 'Furnaces fail on the first cold night.',
    windowLabel: 'SEP–OCT',
    channels: ['blog', 'email'],
    reach: 2,
    sentAt: null,
    postedId: null,
    postedTitle: null,
    ...over,
  };
}

const labels = (b: Recommendation) => prepareRecommendation(b).actions.map((a) => a.label);
const primary = (b: Recommendation) => prepareRecommendation(b).actions.find((a) => a.primary)?.label ?? null;

describe('every action says what it makes', () => {
  it('never says "Write it"', () => {
    for (const b of [beat(), beat({ postedId: 'post-1' }), beat({ channels: ['blog'] }), beat({ channels: ['email'] })]) {
      for (const label of labels(b)) expect(label).not.toMatch(/write it/i);
    }
  });

  it('offers both when the topic supports both', () => {
    expect(labels(beat())).toEqual(['Create email campaign', 'Create blog post']);
  });

  it('offers only what the topic supports', () => {
    expect(labels(beat({ channels: ['email'] }))).toEqual(['Create email campaign']);
    expect(labels(beat({ channels: ['blog'] }))).toEqual(['Create blog post']);
  });
});

describe('a topic that already has a draft does not offer to make another', () => {
  // The bug this rule exists for: pressing the button on a topic that already
  // produced a post left the contractor with two half-written articles.
  it('offers to continue it instead of creating a second', () => {
    const prepared = labels(beat({ postedId: 'post-1', postedTitle: 'Heating tune-up' }));
    expect(prepared).toContain('Continue blog draft');
    expect(prepared).not.toContain('Create blog post');
  });

  it('makes continuing the draft the primary action', () => {
    expect(primary(beat({ postedId: 'post-1' }))).toBe('Continue blog draft');
  });

  it('points at that post’s own editor', () => {
    const action = prepareRecommendation(beat({ postedId: 'post-1' })).actions[0];
    expect(action.href).toBe('/dashboard/marketing/blog/post-1');
  });

  it('still offers the email half, which the draft does not cover', () => {
    expect(labels(beat({ postedId: 'post-1' }))).toContain('Create email campaign');
  });

  it('says a draft exists', () => {
    expect(prepareRecommendation(beat({ postedId: 'post-1' })).badge).toBe('Draft created');
  });
});

describe('exactly one primary action per card', () => {
  it('holds for every shape a topic can take', () => {
    for (const b of [
      beat(),
      beat({ postedId: 'post-1' }),
      beat({ channels: ['blog'] }),
      beat({ channels: ['email'] }),
      beat({ channels: ['blog'], postedId: 'post-1' }),
      beat({ sentAt: '2026-08-01' }),
    ]) {
      const primaries = prepareRecommendation(b).actions.filter((a) => a.primary);
      expect(primaries.length, JSON.stringify(b.channels) + String(b.postedId)).toBe(1);
    }
  });

  it('leads with email when there is no draft to finish', () => {
    expect(primary(beat())).toBe('Create email campaign');
  });

  it('leads with publishing when the reachable email audience is one or smaller', () => {
    expect(labels(beat({ reach: 1 }))).toEqual(['Create blog post', 'Create email campaign']);
    expect(primary(beat({ reach: 1 }))).toBe('Create blog post');
    expect(primary(beat({ reach: 0 }))).toBe('Create blog post');
  });

  it('grows the audience before an email-only idea with nobody to receive it', () => {
    const emailOnly = beat({ channels: ['email'], reach: 0 });
    expect(labels(emailOnly)).toEqual(['Add customer emails', 'Create email campaign']);
    expect(primary(emailOnly)).toBe('Add customer emails');
  });

  it('leads with the blog post when the topic is blog-only', () => {
    expect(primary(beat({ channels: ['blog'] }))).toBe('Create blog post');
  });
});

describe('the overview chooses one account-aware priority', () => {
  const input = {
    mailingAddressReady: true,
    emailReachable: 12,
    attentionCount: 0,
    rebookDue: 0,
    recommendation: prepareRecommendation(beat()),
    hasBlog: true,
  };

  it('surfaces the legal setup blocker before suggesting a campaign', () => {
    const priority = chooseOverviewPriority({ ...input, mailingAddressReady: false });
    expect(priority.title).toBe('Add your mailing address');
    expect(priority.primary.href).toBe('/dashboard/settings');
  });

  it('grows a tiny audience before spending time in the composer', () => {
    const priority = chooseOverviewPriority({ ...input, emailReachable: 1, attentionCount: 4 });
    expect(priority.title).toBe('Grow your email audience');
    expect(priority.primary).toMatchObject({ label: 'Add customer emails', href: '/dashboard/clients' });
    expect(priority.secondary?.label).toBe('Create blog post');
  });

  it('finishes existing work before starting another idea', () => {
    const priority = chooseOverviewPriority({ ...input, attentionCount: 4 });
    expect(priority.title).toBe('Finish what you started');
    expect(priority.primary.href).toContain('status=draft');
  });

  it('uses the seasonal recommendation when setup and queues are healthy', () => {
    const priority = chooseOverviewPriority(input);
    expect(priority.title).toBe('Book a heating tune-up before the first cold snap');
    expect(priority.primary.label).toBe('Create email campaign');
  });
});

describe('order: finish what you started, then new work, then done', () => {
  it('puts a topic with a draft first and a sent one last', () => {
    const out = prepareRecommendations([
      beat({ beatId: 'sent', sentAt: '2026-08-01' }),
      beat({ beatId: 'fresh' }),
      beat({ beatId: 'drafted', postedId: 'post-1' }),
    ]);
    expect(out.map((r) => r.beatId)).toEqual(['drafted', 'fresh', 'sent']);
  });

  // Sunk rather than removed: the blog half may still be undone, and hiding it
  // makes the page look like it ran out of ideas.
  it('keeps an already-sent topic on the page', () => {
    const out = prepareRecommendations([beat({ beatId: 'sent', sentAt: '2026-08-01' })]);
    expect(out).toHaveLength(1);
    expect(out[0].badge).toBe('Already sent');
  });

  it('caps the list', () => {
    expect(prepareRecommendations(Array.from({ length: 9 }, (_, i) => beat({ beatId: `b${i}` })), 4)).toHaveLength(4);
  });

  it('survives having nothing to recommend', () => {
    expect(prepareRecommendations([])).toEqual([]);
  });
});

describe('the four tiles carry a figure and what it is made of', () => {
  it('spells out what needs attention', () => {
    const s = overviewSummary({ drafts: 2, overdue: 1, scheduledCount: 2, nextScheduledLabel: 'Sep 12', publishedThisMonth: 1, emailReachable: 2 });
    expect(s.attention.value).toBe(3);
    expect(s.attention.note).toBe('2 drafts, 1 overdue');
    expect(s.scheduled.note).toBe('Next: Sep 12');
    expect(s.published.note).toBe('Blog post');
    expect(s.audience.note).toBe('Reachable clients');
  });

  it('says so plainly when there is nothing to do', () => {
    const s = overviewSummary({ drafts: 0, overdue: 0, scheduledCount: 0, nextScheduledLabel: null, publishedThisMonth: 0, emailReachable: 0 });
    expect(s.attention.value).toBe(0);
    expect(s.attention.note).toBe('Nothing waiting on you');
    expect(s.scheduled.note).toBe('Nothing scheduled');
  });

  it('singularises one draft', () => {
    expect(overviewSummary({ drafts: 1, overdue: 0, scheduledCount: 0, nextScheduledLabel: null, publishedThisMonth: 0, emailReachable: 1 }).attention.note)
      .toBe('1 draft');
  });
});
