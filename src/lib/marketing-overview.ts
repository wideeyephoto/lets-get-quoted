/**
 * What the Marketing overview should tell somebody to do next.
 *
 * The page used to offer one button per seasonal topic, labelled "Write it".
 * Write what — a blog post, an email, both? It drafted an email, but the same
 * topics are also the blog's topics, so the word was ambiguous exactly where it
 * mattered. Worse, it offered "Write it" on a topic that ALREADY had a draft
 * sitting in the blog, so pressing it produced a second one, and the contractor
 * ended up with two half-written posts about the first cold snap.
 *
 * So every action here names what it makes, and a topic that already produced
 * something offers to CONTINUE it rather than to make another.
 */

export type Recommendation = {
  beatId: string;
  title: string;
  whyNow: string;
  /** "SEP–OCT" — the window this belongs to. */
  windowLabel: string;
  channels: string[];
  /** How many people the topic's audience reaches, when we can say. */
  reach: number | null;
  /** Set once this topic has been emailed. */
  sentAt: string | null;
  /** Set when a blog post already exists for this topic. */
  postedId: string | null;
  postedTitle: string | null;
};

export type RecommendedAction = {
  label: string;
  href: string;
  /** Exactly one action per recommendation is primary. */
  primary: boolean;
};

export type PreparedRecommendation = Recommendation & {
  actions: RecommendedAction[];
  /** "Draft created" / "Sent Aug 1" — the chip beside the title, or null. */
  badge: string | null;
  /** Lower sorts first. */
  rank: number;
};

const BLOG_HREF = '/dashboard/marketing/blog';
const CAMPAIGN_HREF = '/dashboard/marketing/campaigns';

/**
 * Turn one topic into the buttons it should actually show.
 *
 * The ordering rule inside a card: whatever CONTINUES existing work is primary.
 * A half-written draft is worth more than a new idea, and a page that makes
 * "start another thing" the loudest button is a page that accumulates drafts.
 */
export function prepareRecommendation(beat: Recommendation): PreparedRecommendation {
  const actions: RecommendedAction[] = [];
  const supportsBlog = beat.channels.includes('blog');
  const supportsEmail = beat.channels.includes('email');
  const hasDraft = Boolean(beat.postedId);

  if (supportsBlog && hasDraft) {
    actions.push({ label: 'Continue blog draft', href: `${BLOG_HREF}/${beat.postedId}`, primary: true });
  }

  if (supportsEmail) {
    actions.push({
      label: 'Create email campaign',
      href: `${CAMPAIGN_HREF}?draft=beat:${encodeURIComponent(beat.beatId)}`,
      // Primary only when there is no draft to finish first.
      primary: !hasDraft,
    });
  }

  // Never offered alongside "Continue blog draft" — that pair is what produced
  // two posts on one topic.
  if (supportsBlog && !hasDraft) {
    actions.push({
      label: 'Create blog post',
      href: `${BLOG_HREF}?topic=${encodeURIComponent(beat.title)}&beat=${encodeURIComponent(beat.beatId)}`,
      primary: !supportsEmail,
    });
  }

  return {
    ...beat,
    actions,
    badge: hasDraft ? 'Draft created' : beat.sentAt ? 'Already sent' : null,
    rank: rankOf(beat),
  };
}

/**
 * Finish-what-you-started, then new work, then things already done.
 *
 * A topic that has been emailed recently sinks rather than disappearing: the
 * blog half may still be undone, and hiding it would make the page look like it
 * had run out of ideas.
 */
function rankOf(beat: Recommendation): number {
  if (beat.postedId) return 0;
  if (beat.sentAt) return 2;
  return 1;
}

export function prepareRecommendations(beats: Recommendation[], limit = 4): PreparedRecommendation[] {
  return beats
    .map(prepareRecommendation)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export type OverviewSummary = {
  attention: { value: number; note: string };
  scheduled: { value: number; note: string };
  published: { value: number; note: string };
  audience: { value: number; note: string };
};

/**
 * The four tiles. Each carries a figure AND a line saying what it is made of,
 * because "3" on its own is not something anybody can act on.
 */
export function overviewSummary(input: {
  drafts: number;
  overdue: number;
  scheduledCount: number;
  nextScheduledLabel: string | null;
  publishedThisMonth: number;
  emailReachable: number;
}): OverviewSummary {
  const attentionParts = [
    input.drafts > 0 ? `${input.drafts} draft${input.drafts === 1 ? '' : 's'}` : null,
    input.overdue > 0 ? `${input.overdue} overdue` : null,
  ].filter(Boolean);

  return {
    attention: {
      value: input.drafts + input.overdue,
      note: attentionParts.length > 0 ? attentionParts.join(', ') : 'Nothing waiting on you',
    },
    scheduled: {
      value: input.scheduledCount,
      note: input.nextScheduledLabel ? `Next: ${input.nextScheduledLabel}` : 'Nothing scheduled',
    },
    published: {
      value: input.publishedThisMonth,
      note: input.publishedThisMonth === 1 ? 'Blog post' : 'Blog posts',
    },
    audience: {
      value: input.emailReachable,
      // Named as reachable, not as "clients". The difference is consent, and a
      // tile that counted everyone would promise a reach that does not exist.
      note: input.emailReachable === 1 ? 'Reachable client' : 'Reachable clients',
    },
  };
}
