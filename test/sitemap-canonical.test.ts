import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';
import { isMarketingPath } from '@/lib/tenant-host';
import { TRADES } from '@/lib/trades';
import { ARTICLES } from '@/lib/resources';

/**
 * THE SITEMAP MUST NAME THE ADDRESS THE PAGES CLAIM.
 *
 * It did not. Every URL was built from NEXT_PUBLIC_APP_URL, which in production
 * is https://app.letsgetquoted.com, while each of those pages declared a
 * canonical on the apex — so the file whose job is to tell a crawler which of
 * two identical hosts is real was naming the one the pages disowned. Both
 * answered 200. A spot check found the site not indexed at all.
 *
 * This is a silent failure with a long feedback loop — nothing breaks, no test
 * goes red, and the cost shows up weeks later as an empty Search Console. So
 * the invariant is asserted directly: every URL in this file is on the apex.
 */
const APEX = 'https://letsgetquoted.com';

describe('the platform sitemap', () => {
  it('publishes every URL on the canonical host', async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(60);
    for (const entry of entries) {
      expect(entry.url.startsWith(`${APEX}/`) || entry.url === APEX, `${entry.url} is off-canonical`).toBe(true);
    }
  });

  // The specific string that was there. Named rather than implied, because
  // "starts with the apex" would also pass for https://letsgetquoted.com.evil.
  it('names no app-host URL anywhere', async () => {
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url.includes('app.letsgetquoted.com'))).toBe(false);
  });

  /**
   * A sitemap may only list URLs on the host that serves it. Contractor sites
   * live on their own subdomains and custom domains, were listed here anyway,
   * and were therefore being ignored — each one serves its own sitemap now.
   * See the note in src/app/sitemap.ts.
   */
  it('lists no contractor-site URL', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      const host = new URL(entry.url).host;
      expect(host, `${entry.url} is on a tenant host`).toBe('letsgetquoted.com');
    }
  });

  /**
   * The pairing that matters: everything advertised here has to be a path the
   * middleware will keep on this host. A URL in the sitemap that the middleware
   * does not claim is one the app host still answers as a duplicate.
   */
  it('lists only paths the middleware keeps on the apex', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      const path = new URL(entry.url).pathname;
      expect(isMarketingPath(path), `${path} is in the sitemap but not a marketing path`).toBe(true);
    }
  });

  // Cheap coverage check — the two generated groups are the bulk of the file
  // and a broken map would leave the rest passing.
  it('covers every trade and every article', async () => {
    const urls = new Set((await sitemap()).map((entry) => entry.url));
    for (const trade of TRADES) expect(urls.has(`${APEX}/for/${trade.slug}`), trade.slug).toBe(true);
    for (const article of ARTICLES) expect(urls.has(`${APEX}/resources/${article.slug}`), article.slug).toBe(true);
  });
});
