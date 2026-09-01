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

export type OverviewPriority = {
  title: string;
  description: string;
  primary: RecommendedAction;
  secondary: RecommendedAction | null;
  metricLabel: string;
  metricValue: number | string;
  metricNote: string;
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
  // With zero or one reachable reader, spending the next block of time on an
  // email composer is weaker than publishing something that can be found by
  // every local customer. The campaign remains available, but it stops being
  // the loudest action until there is an audience for it.
  const shouldLeadWithBlog = supportsBlog && supportsEmail && !hasDraft && beat.reach != null && beat.reach <= 1;
  const emailOnlyNeedsAudience = supportsEmail && !supportsBlog && !hasDraft && beat.reach != null && beat.reach <= 1;

  if (supportsBlog && hasDraft) {
    actions.push({ label: 'Continue blog draft', href: `${BLOG_HREF}/${beat.postedId}`, primary: true });
  }

  if (supportsBlog && !hasDraft && shouldLeadWithBlog) {
    actions.push({
      label: 'Create blog post',
      href: `${BLOG_HREF}?topic=${encodeURIComponent(beat.title)}&beat=${encodeURIComponent(beat.beatId)}`,
      primary: true,
    });
  }

  if (emailOnlyNeedsAudience) {
    actions.push({ label: 'Add customer emails', href: '/dashboard/clients', primary: true });
  }

  if (supportsEmail) {
    actions.push({
      label: 'Create email campaign',
      href: `${CAMPAIGN_HREF}?draft=beat:${encodeURIComponent(beat.beatId)}`,
      // Primary only when there is no draft to finish first.
      primary: !hasDraft && !shouldLeadWithBlog && !emailOnlyNeedsAudience,
    });
  }

  // Never offered alongside "Continue blog draft" — that pair is what produced
  // two posts on one topic.
  if (supportsBlog && !hasDraft && !shouldLeadWithBlog) {
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

function contentActionFor(recommendation: PreparedRecommendation | null): RecommendedAction | null {
  return recommendation?.actions.find((action) => !/(email campaign|customer emails)/i.test(action.label)) ?? null;
}

/**
 * Pick one answer to "what should I do now?" from the account's actual state.
 *
 * Setup blockers come first, then the audience constraint that makes an email
 * campaign low-value, then unfinished work. Only after those are clear do we
 * lead with a new seasonal idea. This keeps the overview from advertising the
 * same generic campaign CTA to every account regardless of readiness.
 */
export function chooseOverviewPriority(input: {
  mailingAddressReady: boolean;
  replyEmailReady?: boolean;
  emailReachable: number;
  attentionCount: number;
  rebookDue: number;
  recommendation: PreparedRecommendation | null;
  hasBlog: boolean;
}): OverviewPriority {
  const contentAction = contentActionFor(input.recommendation);
  const keepPublishing: RecommendedAction = contentAction ?? (input.hasBlog
    ? { label: 'Manage blog', href: BLOG_HREF, primary: false }
    : { label: 'Set up your website', href: '/dashboard/sites', primary: false });

  if (input.replyEmailReady === false) {
    return {
      title: 'Add a customer reply email',
      description: 'Homeowners need an email address to reply to your estimates, invoices, and campaigns. Add your business email so customer messages reach you.',
      primary: { label: 'Set reply email', href: '/dashboard/settings#business-basics', primary: true },
      secondary: keepPublishing,
      metricLabel: 'Email setup',
      metricValue: 'Blocked',
      metricNote: 'Reply email required',
    };
  }

  if (!input.mailingAddressReady) {
    return {
      title: 'Add your mailing address',
      description: 'Marketing email needs a physical postal address before it can be sent. Add it now so a finished campaign never gets blocked at the last step.',
      primary: { label: 'Add mailing address', href: '/dashboard/settings#marketing-address', primary: true },
      secondary: keepPublishing,
      metricLabel: 'Email setup',
      metricValue: 'Blocked',
      metricNote: 'Address required',
    };
  }

  if (input.emailReachable <= 1) {
    const nobody = input.emailReachable === 0;
    return {
      title: 'Grow your email audience',
      description: nobody
        ? 'No customer can receive email yet. Add customer email addresses first, then use the seasonal idea below when your list is ready.'
        : 'Only 1 customer can receive email. Add more addresses before spending time building a campaign; you can keep publishing useful local content in the meantime.',
      primary: { label: 'Add customer emails', href: '/dashboard/clients', primary: true },
      secondary: keepPublishing,
      metricLabel: 'Audience readiness',
      metricValue: input.emailReachable,
      metricNote: nobody ? 'reachable customers' : 'reachable customer',
    };
  }

  if (input.attentionCount > 0) {
    return {
      title: 'Finish what you started',
      description: `${input.attentionCount} ${input.attentionCount === 1 ? 'item is' : 'items are'} waiting for a finish or publish decision. Clearing that queue is more valuable than starting another draft.`,
      primary: { label: 'Review unfinished content', href: `${BLOG_HREF}?status=draft`, primary: true },
      secondary: input.recommendation
        ? { label: 'View seasonal plan', href: `${CAMPAIGN_HREF}#seasonal`, primary: false }
        : null,
      metricLabel: 'Work to finish',
      metricValue: input.attentionCount,
      metricNote: input.attentionCount === 1 ? 'item needs attention' : 'items need attention',
    };
  }

  if (input.rebookDue > 0) {
    return {
      title: 'Bring past customers back',
      description: `${input.rebookDue} past ${input.rebookDue === 1 ? 'customer has' : 'customers have'} been quiet long enough for a timely check-in. A warm relationship is the shortest path to the next booking.`,
      primary: { label: 'Send booking links', href: '/dashboard/rebook', primary: true },
      secondary: contentAction,
      metricLabel: 'Ready to rebook',
      metricValue: input.rebookDue,
      metricNote: input.rebookDue === 1 ? 'past customer' : 'past customers',
    };
  }

  const recommendation = input.recommendation;
  const primary = recommendation?.actions.find((action) => action.primary) ?? recommendation?.actions[0];
  if (recommendation && primary) {
    return {
      title: recommendation.title,
      description: `${recommendation.whyNow}${recommendation.reach == null
        ? ''
        : recommendation.reach === 1
          ? ' 1 customer is reachable by email.'
          : ` ${recommendation.reach} customers are reachable by email.`}`,
      primary,
      secondary: recommendation.actions.find((action) => action !== primary) ?? null,
      metricLabel: 'Seasonal window',
      metricValue: recommendation.windowLabel,
      metricNote: recommendation.badge ?? 'Recommended now',
    };
  }

  return {
    title: 'Build your next marketing plan',
    description: 'Your queue is clear. Choose a seasonal idea, pick a channel, and give the work a date so it keeps moving without another reminder.',
    primary: { label: 'View seasonal plan', href: `${CAMPAIGN_HREF}#seasonal`, primary: true },
    secondary: { label: 'Manage blog', href: BLOG_HREF, primary: false },
    metricLabel: 'Current status',
    metricValue: 'Clear',
    metricNote: 'Ready for what is next',
  };
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
