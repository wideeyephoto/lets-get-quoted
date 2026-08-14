import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { blocksPublish, normalizeTrade, tradeDriftNotice, tradeDriftOf } from '@/lib/blog-trade-drift';
import { getSiteContent } from '@/lib/site-content';

/**
 * A plumbing business had a live article entirely about window cleaning.
 *
 * The article was not wrong when it was written — the account WAS a window
 * cleaning business then. The owner changed trade, the site changed with it,
 * and the article did not. Nothing noticed, because nothing could: a post
 * stored its title, body, status, date and the marketing beat it came from, and
 * never the trade it was written for.
 *
 * test/blog-trade-passed already pins every caller passing the trade INTO the
 * drafter, so new posts are written for the right trade. This is the other
 * half — they remember which one, so the next trade change is noticed instead
 * of published.
 */

describe('tradeDriftOf', () => {
  it('catches the case that shipped', () => {
    expect(tradeDriftOf('Window cleaning', 'Plumbing')).toBe('drift');
    expect(blocksPublish('drift')).toBe(true);
  });

  it('passes a post written for the trade the site is on', () => {
    expect(tradeDriftOf('Plumbing', 'Plumbing')).toBe('match');
    expect(blocksPublish('match')).toBe(false);
  });

  it('ignores the casing and spacing a person actually types', () => {
    for (const typed of ['plumbing', '  Plumbing ', 'PLUMBING', 'Plumbing']) {
      expect(tradeDriftOf(typed, 'Plumbing'), typed).toBe('match');
    }
    expect(normalizeTrade('  Drain   Cleaning ')).toBe('drain cleaning');
  });

  /**
   * NOT STEMMED, ON PURPOSE. "Plumbing" and "plumber" are probably the same
   * business, and a rule that decides that for the owner is a rule that waves
   * a real drift through. The cost of being strict is one dismissible notice.
   */
  it('does not guess that two similar words are one trade', () => {
    expect(tradeDriftOf('Plumber', 'Plumbing')).toBe('drift');
  });

  /**
   * Every post written before the stamp existed is unrecorded — including the
   * window cleaning one. It gets a notice, not a block: refusing to publish
   * every legacy post would be this change breaking a working site to fix a
   * rare one.
   */
  it('separates "written for something else" from "we never wrote it down"', () => {
    expect(tradeDriftOf(undefined, 'Plumbing')).toBe('unrecorded');
    expect(tradeDriftOf('', 'Plumbing')).toBe('unrecorded');
    expect(blocksPublish('unrecorded')).toBe(false);
  });

  it('says nothing at all when the site has no trade to check against', () => {
    expect(tradeDriftOf('Window cleaning', '')).toBe('unknown');
    expect(tradeDriftOf(undefined, undefined)).toBe('unknown');
    expect(blocksPublish('unknown')).toBe(false);
    expect(tradeDriftNotice('unknown', 'Window cleaning', '')).toBe('');
  });
});

describe('what the notice says', () => {
  it('names both trades, because both are the owner’s', () => {
    const notice = tradeDriftNotice('drift', 'Window cleaning', 'Plumbing');
    expect(notice).toContain('Window cleaning');
    expect(notice).toContain('Plumbing');
    // "Off-trade" alone does not tell somebody which of their own posts this is.
    expect(notice).not.toMatch(/off.trade/i);
  });

  it('asks rather than accuses when the trade was never recorded', () => {
    const notice = tradeDriftNotice('unrecorded', '', 'Plumbing');
    expect(notice).toContain('Plumbing');
    expect(notice).toMatch(/check/i);
  });
});

/**
 * The stamp has to SURVIVE. parseBlogPosts rebuilds every post from named
 * fields, so a field it does not read is dropped on the next ordinary save —
 * which is exactly how this would silently stop working.
 */
describe('the trade is stored on the post', () => {
  const withPost = (post: Record<string, unknown>) =>
    getSiteContent({ blog: { posts: [{ id: 'p1', slug: 's', title: 'T', body: 'B', ...post }] } }).blog.posts[0];

  it('round-trips through a save', () => {
    expect(withPost({ trade: 'Window cleaning' }).trade).toBe('Window cleaning');
  });

  it('stays absent rather than becoming an empty string', () => {
    // '' would read as "recorded, and blank", which the drift check would then
    // have to special-case into meaning "unrecorded" anyway.
    expect(withPost({}).trade).toBeUndefined();
    expect(withPost({ trade: '   ' }).trade).toBeUndefined();
    expect(withPost({ trade: 42 }).trade).toBeUndefined();
  });

  it('is trimmed and bounded like every other stored string', () => {
    expect(withPost({ trade: '  Plumbing  ' }).trade).toBe('Plumbing');
    expect(withPost({ trade: 'x'.repeat(200) }).trade).toHaveLength(80);
  });
});

/**
 * Three places turn a draft into a post, and all three had to be changed. This
 * is the same omission-shaped bug test/blog-trade-passed guards on the way in:
 * a caller that forgets type-checks, runs, and produces a post that simply
 * cannot be checked later.
 */
describe('every caller stamps what it drafted', () => {
  const CALLERS = [
    'src/app/api/cron/blog/route.ts',
    'src/app/dashboard/marketing/actions.ts',
    'src/app/dashboard/marketing/blog/actions.ts',
  ];

  it.each(CALLERS)('%s stamps the trade on the post it creates', (path) => {
    expect(readFileSync(path, 'utf8')).toContain('...(draft.trade ? { trade: draft.trade } : {})');
  });

  it('takes the trade from the drafter, not from the site at save time', () => {
    // The owner can change trade while a draft is generating. The stamp has to
    // describe the ARTICLE, which is what the prompt was given.
    const GENERATE = readFileSync('src/lib/blog-generate.ts', 'utf8');
    expect(GENERATE).toContain('return { title, excerpt: asString(parsed.excerpt, 200), body, trade };');
  });
});

/** The editor is where it has to be impossible to miss. */
describe('the post editor', () => {
  const EDITOR = readFileSync('src/app/dashboard/marketing/blog/[id]/PostEditor.tsx', 'utf8');

  it('gates Ready and Publish, and nothing else', () => {
    expect(EDITOR).toContain('const tradeBlocked = blocksPublish(drift) && !tradeAcknowledged;');
    // Two gated buttons: Mark as ready, Publish now.
    expect(EDITOR.match(/disabled=\{tradeBlocked\}/g) ?? []).toHaveLength(2);
    // Pulling it back is never gated — that is the thing this wants to be easy.
    const back = EDITOR.slice(EDITOR.indexOf('Back to draft') - 200, EDITOR.indexOf('Back to draft'));
    expect(back).not.toContain('tradeBlocked');
  });

  it('offers a way through, because the owner may be right', () => {
    expect(EDITOR).toContain('Publish it anyway');
  });

  /** Not persisted: "yes I know" is about this press. Saving it would mean a
   *  post waved through once could never warn again, including after the NEXT
   *  trade change. */
  it('does not remember the override', () => {
    expect(EDITOR).toContain('const [tradeAcknowledged, setTradeAcknowledged] = useState(false);');
    expect(EDITOR).not.toMatch(/edit\(\{[^}]*acknowledged/);
  });

  it('warns hardest about a post that is already live', () => {
    expect(EDITOR).toContain('This is live and off-trade.');
  });
});
