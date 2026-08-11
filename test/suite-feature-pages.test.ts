import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { FEATURE_CATEGORIES, FEATURE_COUNT } from '@/lib/features';

/**
 * The seven pages behind the homepage's suite cards.
 *
 * WHY THEY EXIST. Every one of these cards used to land somewhere more general
 * than the promise it made — /features#payments for "Cash flow", an anchor
 * part-way down /features/back-office for "Quotes + e-sign". Seven specific
 * promises, four destinations, none of them the answer.
 *
 * WHAT THIS SUITE PROTECTS, in order of how badly it would hurt:
 *
 *   THE CATALOG IS READ, NOT RESTATED. The capability list on each page comes
 *   out of lib/features.ts — the same array /features and the homepage grid
 *   render. A page that retypes a catalog is a page that will eventually
 *   describe a product that no longer exists, and nothing would fail when it
 *   did. This is the same rule the fee numbers already follow.
 *
 *   THE CLAIMS. These pages are about money, labor and reviews, which is the
 *   part of the product it is easiest to overpromise. Three specific things the
 *   product deliberately does NOT do are asserted to still be said out loud.
 *
 *   THE LINKS. A card pointing at a route that does not exist is a 404 that
 *   type-checks and builds.
 */

const SUITE = [
  { slug: 'quotes', catalog: ['quotes'] },
  { slug: 'scheduling', catalog: ['scheduling'] },
  { slug: 'crew', catalog: ['jobs'] },
  { slug: 'payments', catalog: ['payments'] },
  { slug: 'recurring', catalog: ['recurring'] },
  { slug: 'cash-flow', catalog: ['insights'] },
  { slug: 'reviews', catalog: ['reviews', 'marketing'] },
] as const;

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
/** WHY comments quote the copy being asserted, so they have to come out. */
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const page = (slug: string) => strip(read(`src/app/features/${slug}/page.tsx`));
const SHELL = strip(read('src/components/marketing/suite-feature-page.tsx'));

describe('every suite page exists and is wired up', () => {
  it.each(SUITE)('/features/$slug is a route on disk', ({ slug }) => {
    expect(existsSync(`src/app/features/${slug}/page.tsx`)).toBe(true);
  });

  it.each(SUITE)('/features/$slug is in the sitemap', ({ slug }) => {
    expect(read('src/app/sitemap.ts')).toContain(`'${slug}'`);
  });

  it('the homepage suite cards are exactly these seven, in order', () => {
    const home = read('src/components/flagship/flagship-home.tsx');
    const block = home.slice(home.indexOf('const suite:'), home.indexOf('];', home.indexOf('const suite:')));
    const hrefs = [...block.matchAll(/"\/features\/([a-z-]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(SUITE.map((entry) => entry.slug));
  });

  it('the tool cards on /features point at the same pages', () => {
    // The same seven names appear on the features index. Leaving those on
    // back-office anchors while the homepage went to real pages would have been
    // two answers to one question.
    const stages = read('src/app/features/job-record-stages.tsx');
    for (const slug of ['scheduling', 'crew', 'recurring', 'quotes', 'payments', 'cash-flow', 'reviews']) {
      expect(stages, slug).toContain(`href: '/features/${slug}'`);
    }
    expect(stages).not.toContain('/features/back-office#');
  });
});

/**
 * /features/back-office is the hub, and its capability list is the map.
 *
 * Until these pages existed, that list was also the end of the road: a reader
 * who wanted more than three lines on payment plans had nowhere to go. Each of
 * the four stages now names the pages that take it apart — which is also the
 * only thing keeping back-office from reading as a rival to the seven rather
 * than the page they all belong to.
 */
describe('the back office links out to the pages that go deeper', () => {
  const BACK_OFFICE = strip(read('src/app/features/back-office/page.tsx'));
  const linked = [...BACK_OFFICE.matchAll(/href: '(\/features\/[a-z-]+)'/g)].map((m) => m[1]);

  it('reaches all seven suite pages', () => {
    for (const { slug } of SUITE) {
      expect(linked, slug).toContain(`/features/${slug}`);
    }
  });

  it('reaches the client portal too, which is the eighth thing that stage covers', () => {
    expect(linked).toContain('/features/client-portal');
  });

  it('gives every one of the four stages a way out', () => {
    // A stage with no exit is the dead end this change exists to remove.
    const groups = BACK_OFFICE.slice(
      BACK_OFFICE.indexOf('const CAPABILITY_GROUPS'),
      BACK_OFFICE.indexOf('const CAPABILITY_COUNT'),
    );
    expect([...groups.matchAll(/id: '/g)]).toHaveLength(4);
    expect([...groups.matchAll(/deeper: \[/g)]).toHaveLength(4);
  });

  it('keeps the seventeen long-form explanations', () => {
    // The suite pages are built from lib/features.ts's short catalog entries;
    // these are long-form and written for this page. Replacing them with links
    // would have cost the page what it is best at to remove a duplication that
    // does not exist.
    expect([...BACK_OFFICE.matchAll(/^\s+term: '/gm)]).toHaveLength(17);
    expect(BACK_OFFICE).toContain('<p>{item.detail}</p>');
  });

  it('tells a screen reader which stage each link belongs to', () => {
    // Three groups offer a link called "Payments", "Cash flow" or similar. A
    // links list read out of context would otherwise be several identical
    // names with nothing to separate them.
    expect(BACK_OFFICE).toContain('{group.stage.toLowerCase()}');
    expect(BACK_OFFICE).toContain('className="sr-only"');
  });

  it('gives those links a real tap target', () => {
    const css = read('src/app/features/back-office/back-office.module.css');
    expect(css).toMatch(/\.capDeeper a \{[^}]*min-height: 44px/);
  });
});

describe('the capability list is read from the product catalog', () => {
  it('the shell reads FEATURE_CATEGORIES rather than a list of its own', () => {
    expect(SHELL).toContain("from '@/lib/features'");
    expect(SHELL).toContain('FEATURE_CATEGORIES.find((category) => category.slug === slug)');
    // A page naming a category that does not exist must fail loudly. Rendering
    // an empty second half silently is the failure this prevents.
    expect(SHELL).toContain('throw new Error');
  });

  it.each(SUITE)('/features/$slug names catalog slugs that exist', ({ slug, catalog }) => {
    const source = page(slug);
    const named = source.slice(source.indexOf('catalog={['), source.indexOf(']}', source.indexOf('catalog={[')));
    for (const wanted of catalog) {
      expect(named, `${slug} -> ${wanted}`).toContain(`'${wanted}'`);
      expect(FEATURE_CATEGORIES.some((category) => category.slug === wanted)).toBe(true);
    }
  });

  it('no suite page hardcodes a feature name the catalog owns', () => {
    // Spot-check against the catalog itself: if a page restated an entry's
    // description verbatim it would be a second copy to keep in step.
    const descriptions = FEATURE_CATEGORIES.flatMap((c) => c.features.map((f) => f.desc));
    for (const { slug } of SUITE) {
      const source = page(slug);
      const copied = descriptions.filter((desc) => source.includes(desc));
      expect(copied, `${slug} restates ${copied[0]}`).toEqual([]);
    }
  });

  it('covers every homepage promise with a real category', () => {
    const covered = new Set(SUITE.flatMap((entry) => entry.catalog));
    for (const slug of covered) {
      expect(FEATURE_CATEGORIES.map((c) => c.slug)).toContain(slug);
    }
    expect(FEATURE_COUNT).toBeGreaterThan(covered.size);
  });
});

describe('what these pages promise', () => {
  it.each(SUITE)('/features/$slug prices from the fee model, not from a number', ({ slug }) => {
    const source = page(slug);
    expect(source).toContain('FEE_TIERS[0].rate');
    expect(source).toContain('STRIPE_PROCESSING_NOTE');
    // A rate typed into marketing copy is a rate that drifts from /pricing.
    expect(source).not.toMatch(/\b1\.25%|0\.65%/);
  });

  it.each(SUITE)('/features/$slug invents no social proof', ({ slug }) => {
    const source = page(slug);
    expect(source).not.toMatch(/\b\d[\d,]*\+? (contractors|customers|users|businesses) (use|trust|have)/i);
    expect(source).not.toMatch(/trusted by|testimonial|award[- ]winning/i);
    expect(source).not.toMatch(/\brated\s*\d|\b\d(\.\d)?\s*(out of|\/)\s*5\b/i);
  });

  it.each(SUITE)('/features/$slug labels its mock as invented', ({ slug }) => {
    // Same rule as every other panel on the marketing site: an unmarked
    // screenshot-like panel reads as a real account.
    expect(page(slug)).toMatch(/<ExampleFrame/);
    expect(page(slug)).toMatch(/[Ii]nvented/);
  });

  it('keeps saying the three things the product does NOT do', () => {
    // Each of these was written down deliberately somewhere in the codebase and
    // is the kind of honesty that quietly disappears in a marketing rewrite.
    expect(page('crew')).toContain('no tax is calculated or withheld');
    expect(page('payments')).toContain('no credit check');
    expect(page('reviews')).toContain('breaks Google’s');
    // And the one on scheduling: weather flags, it never reschedules for you.
    expect(page('scheduling')).toMatch(/never|flags/i);
  });

  it('does not claim the cash forecast connects to a bank', () => {
    const source = page('cash-flow');
    expect(source).toContain('Does this connect to my bank?');
    expect(source).toMatch(/No\. You tell it what is in the account/);
  });
});

describe('the shell', () => {
  it('gives every page the same questions treatment as the flagship pages', () => {
    // The markup moved into FaqList so a bespoke page could have one too —
    // /features/client-portal had no questions at all, on the one subject
    // (who can open a link with no login) where a contractor has the most.
    expect(SHELL).toContain('<FaqList items={faq} />');
    const faqList = strip(read('src/components/marketing/faq-list.tsx'));
    expect(faqList).toContain('<details key={item.q} open={index === 0}>');
    // No `name`: an exclusive accordion hides every other answer from the
    // browser's own find-in-page.
    expect(faqList).not.toMatch(/<details[^>]*name=/);
    // And it is the same stylesheet, so the two cannot drift apart visually.
    expect(faqList).toContain("from './suite-feature-page.module.css'");
  });

  it('the portal page now answers the question its own pitch raises', () => {
    const portal = strip(read('src/app/features/client-portal/page.tsx'));
    expect(portal).toContain('FaqList');
    // The five it has to answer before a contractor will send one.
    expect(portal).toMatch(/who can open it/i);
    expect(portal).toMatch(/turn a link off/i);
    expect(portal).toMatch(/sign up, or install anything/i);
    expect(portal).toMatch(/crew and office staff/i);
    expect(portal).toMatch(/replies STOP/i);
  });

  it('sets the capability copy at reading size, not caption size', () => {
    // The shared layout was already corrected once for setting sentences at
    // 11px on five pages. These are sentences.
    const css = read('src/components/marketing/suite-feature-page.module.css');
    expect(css).toMatch(/\.list span \{[^}]*font-size: 0\.92rem/);
    expect(css).toMatch(/\.faq summary \{[^}]*min-height: 56px/);
  });

  it('sends a reader on to the full catalog', () => {
    expect(SHELL).toContain('href="/features"');
  });
});

/**
 * THE THIRD HERO BUTTON: "show me".
 *
 * The two that were there are "sign up" and "read on". Neither is the smallest
 * ask on the page, and the route to the live demo of the thing being described
 * was the /demo index and then the right tab.
 *
 * WHY THE LABEL IS CHECKED AGAINST THE DESTINATION. A button that 200s but
 * lands on an adjacent screen is worse than no button, because the
 * disappointment is what the visitor remembers. /features/payments deliberately
 * has none: no demo screen IS payments — the money in /demo/cash-flow is the
 * forecast, and quotes and deposits live on /demo/jobs, which two other pages
 * already point at for what it actually shows.
 */
/**
 * ONE PRIMARY ACTION, AND IT BELONGS TO THE PAGE IT IS ON.
 *
 * Eight of these pages led with "Build my free site" — including the ones
 * selling payments, scheduling and crew management, where a free website
 * answers a question the reader did not ask. Eleven of the twelve then offered
 * a THIRD button, so the hero presented a demo, a signup and a jump link at
 * once, which is less a choice than an invitation to make none.
 *
 * The demo used to be that third button. It is the first one now.
 */
describe('every feature hero leads with its own contextual action', () => {
  /** slug -> the primary's destination. */
  const PRIMARY: Record<string, string> = {
    'website-builder': '/demo/sites',
    'ai-intake': '#sample-intake',
    'quick-stops': '/demo/quick-stops',
    'client-portal': '/demo/messages',
    'back-office': '/demo/jobs/job-1',
    quotes: '/demo/jobs/job-13',
    scheduling: '/demo/schedule',
    crew: '/demo/crew',
    recurring: '/demo/recurring',
    'cash-flow': '/demo/cash-flow',
    reviews: '/demo/reviews',
  };

  it.each(Object.entries(PRIMARY))('/features/%s -> %s', (slug, href) => {
    const source = page(slug);
    const match = source.match(/primary=\{\{ label: '([^']+)', href: '([^']+)' \}\}/);
    expect(match, `${slug} has no contextual primary action`).toBeTruthy();
    expect(match![2]).toBe(href);
    expect(match![1].length).toBeGreaterThan(8);
  });

  it.each(Object.entries(PRIMARY).filter(([, href]) => href.startsWith('/')))(
    '%s points at a route that exists (%s)',
    (_slug, href) => {
      // A demo link that lands somewhere adjacent is worse than no link, so the
      // route file has to be there. Dynamic segments resolve to their [id] dir.
      const direct = `src/app${href}/page.tsx`;
      const dynamic = `src/app${href.replace(/\/[^/]+$/, '/[id]')}/page.tsx`;
      expect(existsSync(direct) || existsSync(dynamic), href).toBe(true);
    },
  );

  it('never leads with the website offer on a page that is not about websites', () => {
    for (const slug of Object.keys(PRIMARY)) {
      if (slug === 'website-builder') continue;
      const source = page(slug);
      const match = source.match(/primary=\{\{ label: '([^']+)'/);
      expect(match?.[1], slug).not.toBe('Build my free site');
    }
  });

  it('offers exactly two actions — the third slot is gone from both shells', () => {
    const layout = strip(read('src/components/marketing/feature-detail-layout.tsx'));
    expect(layout).not.toContain('tertiary');
    expect(SHELL).not.toContain('tertiary');
    for (const slug of Object.keys(PRIMARY)) {
      expect(page(slug), slug).not.toContain('tertiary=');
    }
    expect(page('payments')).not.toContain('tertiary=');
  });

  it('makes signing up the quiet second option, by default', () => {
    const layout = strip(read('src/components/marketing/feature-detail-layout.tsx'));
    expect(layout).toContain('SECONDARY_SIGNUP_LABEL');
    const links = strip(read('src/components/marketing/links.tsx'));
    expect(links).toContain("export const SECONDARY_SIGNUP_LABEL = 'Start free'");
  });

  it('/features/payments leads with the thing it sells, having no demo screen', () => {
    // If a /demo/payments screen ever ships, this is the test to change.
    expect(existsSync('src/app/demo/payments/page.tsx')).toBe(false);
    expect(page('payments')).toContain("primary={{ label: 'Start taking deposits' }}");
  });
});

/**
 * THE VIDEO STUDIO, which the catalog had never heard of.
 *
 * Six section layouts, uploads, codec sniffing and size advice all ship in
 * dashboard/sites/VideoStudio — and lib/features.ts, the catalog /features and
 * the homepage grid and every suite page read from, did not mention video once.
 * So a shipped feature was invisible everywhere the product lists what it does.
 *
 * WHAT IS PINNED IS THE LIMIT OF THE CLAIM. The page says the builder checks a
 * clip and names the fix. It must not start saying it writes shot lists or
 * scripts anything — nothing in the product does that, and it is the obvious
 * next sentence for somebody rewriting this copy.
 */
describe('the video studio is in the catalog and on the page', () => {
  const WEBSITE = page('website-builder');
  const site = FEATURE_CATEGORIES.find((category) => category.slug === 'website')!;

  it('the catalog carries the layouts, the upload and the checks', () => {
    for (const id of ['video-sections', 'video-upload', 'video-checks']) {
      expect(site.features.map((f) => f.id), id).toContain(id);
    }
  });

  it('sells video as a feature of the site, not as the page', () => {
    // IT WAS THE PAGE FOR ONE RELEASE, and that was the overcorrection: the
    // eyebrow, the lede, the hero button and the nav label all named video at
    // once, on the page a contractor arrives at because they have no website.
    // A feature of the thing must not outrank the thing. So it lives in a
    // benefit and an answer, and the four places above are pinned CLEAR of it.
    expect(WEBSITE).toMatch(/eyebrow="AI website builder for contractors"/);
    expect(WEBSITE).not.toMatch(/eyebrow="[^"]*video/i);
    expect(WEBSITE).not.toMatch(/lede="[^"]*video/i);
    expect(WEBSITE).not.toMatch(/tertiary=\{\{ label: '[^']*video/i);

    const benefits = WEBSITE.slice(WEBSITE.indexOf('benefits={['), WEBSITE.indexOf('storyId='));
    expect(benefits).toMatch(/video/i);
    // Still three. The compression this page was rebuilt for stands.
    expect([...benefits.matchAll(/title: '/g)]).toHaveLength(3);
    // And the answer, which is where the detail belongs.
    expect(WEBSITE).toContain('What kind of video can I put on it?');
  });

  it('counts the six layouts the product actually has', () => {
    // VIDEO_SECTION_STYLES is the source of truth; if a seventh is added, the
    // page and the catalog entry both start lying and this is what says so.
    const styles = readFileSync('src/lib/site-content.ts', 'utf8');
    const block = styles.slice(styles.indexOf('VIDEO_SECTION_STYLES'), styles.indexOf('const VIDEO_STYLE_KEYS'));
    expect([...block.matchAll(/\{ key: '/g)]).toHaveLength(6);
    expect(site.features.find((f) => f.id === 'video-sections')?.desc).toContain('Six layouts');
    expect(WEBSITE).toContain('six video layouts');
  });

  it('promises checking, not scriptwriting', () => {
    // The line the copy must not cross. Nothing in the product plans a shoot.
    expect(WEBSITE).not.toMatch(/shot list|storyboard|script(s|ing|ed)? (your|the) video|we film/i);
    // And the check is advice, which is how it behaves — videoPlaybackWarning
    // and heroDurationAdvice both warn and return; neither refuses an upload.
    expect(WEBSITE).toMatch(/advises rather than refusing|never blocks|It advises/i);
  });

  it('reaches the builder from the nav and the hero', () => {
    const chrome = readFileSync('src/components/flagship/site-chrome.tsx', 'utf8');
    expect(chrome).toMatch(/\['\/features\/website-builder', '[^']*[Ww]ebsite[^']*'\]/);
    // The template picker is the hero's primary now, not its third button:
    // nobody commits to a website they have not looked at.
    expect(WEBSITE).toMatch(/primary=\{\{ label: '[^']+', href: '\/demo\/sites' \}\}/);
  });
});

/**
 * A CATALOG NOTHING RENDERS IS A CATALOG NOBODY MAINTAINS.
 *
 * lib/features.ts's own header used to say the /features page rendered the full
 * list. It has not since that page's "everything" band became the job-record
 * component — so the three video entries added with this change raised a count
 * on /pricing and appeared in no list anywhere until the website-builder page
 * started rendering its category.
 */
describe('every catalog category is rendered by some page', () => {
  const RENDERED = SUITE.flatMap((entry) => entry.catalog);

  it('the builder page links on instead of listing', () => {
    // THE CATALOG CAME OFF THAT PAGE. Twelve entries, 1,837px of a phone
    // screen, and every claim in them already made further up — measured at
    // 390x844. What a visitor wants at the end of that page is not a longer
    // list of what the site has; it is the page for whatever happens after the
    // request lands. So four links replaced it, and the thing worth protecting
    // is that they REACH somewhere: a chip pointing at a 404 would be worse
    // than the list it replaced.
    const source = page('website-builder');
    expect(source).not.toContain('<CapabilitySection');
    const hrefs = [...source.matchAll(/href: '(\/features\/[a-z-]+)'/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) expect(existsSync(`src/app${href}/page.tsx`), href).toBe(true);
  });

  it('names only categories that exist', () => {
    for (const slug of RENDERED) {
      expect(FEATURE_CATEGORIES.map((c) => c.slug), slug).toContain(slug);
    }
  });

  it('reports which categories no page shows', () => {
    // Not a failure — several are genuinely covered by the flagship pages in
    // prose rather than as a list. It is here so the gap is VISIBLE when a
    // category is added, instead of being discovered by a count that moved.
    //
    // 'website' joined this list when the builder page dropped its catalog, and
    // that is the cost of the change, stated rather than hidden: the twelve
    // website entries — video-sections, video-upload and video-checks among
    // them — now raise the count on /pricing, /for/<trade> and /founder and
    // appear as entries on no page. The builder page still SELLS video, in a
    // benefit and an answer; what it no longer does is enumerate the category.
    const missing = FEATURE_CATEGORIES.map((c) => c.slug).filter((slug) => !RENDERED.includes(slug));
    expect(missing.sort()).toEqual(['clients', 'getting-found', 'leads', 'website']);
  });
});
