/**
 * One vocabulary for what state a blog post is in.
 *
 * The page used to say "Live" for a published post, "Draft" for everything else,
 * and "Scheduled <date>" as a third thing spliced in from `publishAt` — so a post
 * that was finished and waiting was indistinguishable from one that was three
 * words long. Five states, named the same way everywhere:
 *
 *   Draft      — being written.
 *   Ready      — finished, deliberately not out yet.
 *   Scheduled  — has a date in the future, will publish itself.
 *   Published  — on the website.
 *   Archived   — taken out of the way. Not deleted, not public.
 *
 * Four of those are STORED. `Scheduled` is DERIVED, on purpose: `publishAt` is
 * what the nightly cron actually reads, and storing a parallel 'scheduled' status
 * beside it would give scheduling two sources of truth that drift the first time
 * somebody clears the date. So a post is scheduled when it holds a future date
 * and has not gone out — which is exactly the condition the cron acts on.
 */

/** What can be written to a post. */
export type StoredPostStatus = 'draft' | 'ready' | 'published' | 'archived';
/** What a human is shown, including the derived one. */
export type PostState = 'draft' | 'ready' | 'scheduled' | 'published' | 'archived';

export const STORED_POST_STATUSES: StoredPostStatus[] = ['draft', 'ready', 'published', 'archived'];

export const POST_STATE_LABEL: Record<PostState, string> = {
  draft: 'Draft',
  ready: 'Ready',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

/**
 * Parse whatever is stored. Anything unrecognised is a DRAFT — the one state
 * that is never public and never auto-publishes, so a garbled value can only
 * ever fail safe.
 */
export function normalizePostStatus(value: unknown): StoredPostStatus {
  const raw = String(value ?? '').trim().toLowerCase();
  return (STORED_POST_STATUSES as string[]).includes(raw) ? (raw as StoredPostStatus) : 'draft';
}

export type StatefulPost = {
  status: StoredPostStatus;
  /** YYYY-MM-DD, or '' for none. */
  publishAt: string;
};

/**
 * What to CALL this post today.
 *
 * `todayKey` is passed in rather than read off the clock so this is a pure
 * function and so a scheduled date can be tested against a fixed day. A date
 * that has already passed is not "scheduled" — the post either went out (and is
 * published) or the cron has not run yet, and calling a stale date "scheduled"
 * would tell somebody to keep waiting for something that already happened.
 */
export function postState(post: StatefulPost, todayKey: string): PostState {
  if (post.status === 'published') return 'published';
  if (post.status === 'archived') return 'archived';
  if (isFutureDate(post.publishAt, todayKey)) return 'scheduled';
  return post.status === 'ready' ? 'ready' : 'draft';
}

function isFutureDate(value: string, todayKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value > todayKey;
}

/**
 * Whether the nightly cron should publish this one.
 *
 * Archived is excluded, and that is the whole reason this exists as a named
 * function. The cron's own test was `status !== 'published' && publishAt <= today`,
 * which was right while there were only two statuses and becomes a bug the moment
 * there is a third: a post someone archived while it still held a schedule would
 * quietly put itself back on their website.
 */
export function shouldAutoPublish(post: StatefulPost, todayKey: string): boolean {
  if (post.status === 'published' || post.status === 'archived') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(post.publishAt) && post.publishAt <= todayKey;
}

export type PostCounts = Record<PostState, number> & { all: number };

/** Every post counted exactly once, so the filter chips and the totals agree. */
export function countStates(posts: StatefulPost[], todayKey: string): PostCounts {
  const counts: PostCounts = { all: 0, draft: 0, ready: 0, scheduled: 0, published: 0, archived: 0 };
  for (const post of posts) {
    counts.all += 1;
    counts[postState(post, todayKey)] += 1;
  }
  return counts;
}

/**
 * The date line under a post title — always SAYS which date it is.
 *
 * "Aug 4" alone is unreadable: it could be when it was written, when it goes
 * out, or when it went out, and those mean opposite things.
 */
export function postDateLabel(
  post: StatefulPost & { date: string },
  todayKey: string,
  format: (key: string) => string = shortDate,
): string {
  const state = postState(post, todayKey);
  if (state === 'published') return post.date ? `Published ${format(post.date)}` : 'Published';
  if (state === 'scheduled') return `Scheduled for ${format(post.publishAt)}`;
  if (state === 'archived') return post.date ? `Archived · last saved ${format(post.date)}` : 'Archived';
  return post.date ? `Updated ${format(post.date)}` : 'Not saved yet';
}

/** "Aug 4" / "Sep 12". Local parts — never new Date('YYYY-MM-DD'), which is UTC
 *  and lands a day early west of Greenwich. */
export function shortDate(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function todayKeyOf(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What the Overview's "Needs attention" tile counts.
 *
 * Drafts plus anything whose schedule has come and gone without publishing. The
 * second half matters more than the first: a post with yesterday's date on it is
 * a post the owner believes is live.
 */
export function needsAttention(posts: (StatefulPost & { title: string })[], todayKey: string): {
  drafts: number;
  overdue: number;
  total: number;
} {
  let drafts = 0;
  let overdue = 0;
  for (const post of posts) {
    const state = postState(post, todayKey);
    if (state === 'draft') drafts += 1;
    // Not published, not archived, and its date is in the past.
    if (
      post.status !== 'published' &&
      post.status !== 'archived' &&
      /^\d{4}-\d{2}-\d{2}$/.test(post.publishAt) &&
      post.publishAt <= todayKey
    ) {
      overdue += 1;
    }
  }
  return { drafts, overdue, total: drafts + overdue };
}
