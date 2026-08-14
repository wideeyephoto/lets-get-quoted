/**
 * Has this post's trade moved out from under it?
 *
 * THE FAILURE THIS EXISTS FOR. A plumbing business had a live article entirely
 * about window cleaning and window maintenance, published under its own byline
 * on its own site. The article was not wrong when it was written — the account
 * WAS a window cleaning business then. The owner changed trade, the site
 * changed with it, and the article did not.
 *
 * Nothing noticed, because nothing could: a post recorded its title, its body,
 * its status and the marketing beat it came from, and never the trade it was
 * written for. Once written, an article is just prose — there is no field to
 * compare against the trade the site now says it is.
 *
 * lib/blog-generate has been told the trade for a while (and
 * test/blog-trade-passed pins every caller passing it), so posts are written
 * for the right trade. This is the other half: they now REMEMBER which one,
 * so a trade change can be noticed instead of published.
 *
 * Pure and string-only. Whether a drifted post may go live is the caller's
 * decision, not this file's.
 */

export type TradeDrift =
  /** The post was written for the trade the site is set to now. */
  | 'match'
  /** Written for a different trade. The window-cleaning-on-a-plumber case. */
  | 'drift'
  /** Written before posts recorded a trade. Cannot be checked automatically. */
  | 'unrecorded'
  /** The site has no trade set, so there is nothing to check against. */
  | 'unknown';

/**
 * Trades are free text a contractor typed, so "Plumbing", "plumbing" and
 * " Plumber " are all the same answer to the same question. Compared on a
 * squashed form rather than raw, and NOT stemmed: "plumbing" and "plumber"
 * stay distinct here on purpose, because guessing that two words mean one trade
 * is how a real drift gets waved through.
 */
export function normalizeTrade(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function tradeDriftOf(postTrade: string | null | undefined, siteTrade: string | null | undefined): TradeDrift {
  const site = normalizeTrade(siteTrade);
  if (!site) return 'unknown';
  const post = normalizeTrade(postTrade);
  if (!post) return 'unrecorded';
  return post === site ? 'match' : 'drift';
}

/**
 * Only a confirmed drift blocks. 'unrecorded' is a prompt to look, not an
 * accusation: every post written before the stamp existed is unrecorded, and
 * refusing to publish all of them would be this change breaking a working site
 * to fix a rare one.
 */
export function blocksPublish(drift: TradeDrift): boolean {
  return drift === 'drift';
}

/** What to say on the row. Names both trades, because "off-trade" alone does
 *  not tell somebody which of their own posts this is. */
export function tradeDriftNotice(
  drift: TradeDrift,
  postTrade: string | null | undefined,
  siteTrade: string | null | undefined,
): string {
  if (drift === 'drift') {
    return `Written for ${(postTrade ?? '').trim()}. Your trade is now ${(siteTrade ?? '').trim()}.`;
  }
  if (drift === 'unrecorded') {
    return `Written before posts recorded a trade. Check it still fits ${(siteTrade ?? '').trim()}.`;
  }
  return '';
}
