import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Every /features link on the homepage has to land on something.
 *
 * WHY A SOURCE-SHAPE TEST. The failure this guards is a rename on one side
 * only, and it is completely silent: a wrong fragment type-checks, builds,
 * renders, and returns 200. The browser simply scrolls nowhere, which reads as
 * "the link is broken" to a visitor and as nothing at all to CI. A wrong PATH
 * at least 404s, but only if somebody clicks it.
 *
 * THE HOMEPAGE NOW LINKS AT TWO DEPTHS, deliberately:
 *
 *   /features/<slug>   the strip under the hero and the three flagship cards.
 *                      These are specific claims — "one-click AI builder" — so
 *                      they go to the page that answers them outright.
 *   /features#<id>     the suite cards further down, which name a broad area
 *                      (scheduling, payments) and land on the matching group.
 *
 * It used to be all fragments, including four hero badges that no longer
 * exist; the strip pointing at the card index was a summary of a summary.
 */

const HOME = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8');
const FEATURES = readFileSync('src/app/features/page.tsx', 'utf8');
/* The four capability ids moved out with the bands that carried them: they are
   the stage tabs of the job-record component now. The contract is unchanged —
   nine ids, all reachable from the homepage — but it is spread over two files,
   so the source this reads has to be too. */
const STAGES = readFileSync('src/app/features/job-record-stages.tsx', 'utf8');

/** Every '/features#thing' and '/features/thing' the homepage links to. */
const linked = [...HOME.matchAll(/["'](\/features[#/][a-z0-9#/-]+)["']/g)].map((m) => m[1]);
const fragments = linked.filter((href) => href.includes('#')).map((href) => href.split('#')[1]);
const paths = [...new Set(linked.filter((href) => !href.includes('#')))];

/** Every `id: 'thing'` in FLAGSHIPS and in the four stages. */
const featureIds = [...`${FEATURES}\n${STAGES}`.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map(
  (m) => m[1],
);

describe('homepage links into /features', () => {
  it('finds the links at all', () => {
    // If the regex stops matching — a move to a helper, a switch to backticks —
    // every assertion below would pass vacuously against an empty list. This is
    // the guard against a green run that checked nothing.
    expect(linked.length).toBeGreaterThanOrEqual(9);
    expect(featureIds.length).toBe(9);
  });

  it('points every fragment at an id that exists on the features page', () => {
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.filter((id) => !featureIds.includes(id))).toEqual([]);
  });

  it('points every deep link at a route that exists on disk', () => {
    const missing = paths.filter((href) => !existsSync(`src/app${href}/page.tsx`));
    expect(missing).toEqual([]);
  });

  it('keeps the four capability groups reachable from the suite cards', () => {
    for (const id of ['planning-and-scheduling', 'automations', 'payments', 'website-and-growth']) {
      expect(fragments).toContain(id);
      expect(featureIds).toContain(id);
    }
  });

  it('sends the strip under the hero straight to the feature pages', () => {
    for (const slug of ['website-builder', 'ai-intake', 'back-office', 'quick-stops']) {
      expect(paths).toContain(`/features/${slug}`);
    }
  });

  it('never repeats an id on the features page', () => {
    // Two elements sharing a fragment is a coin toss over which one the browser
    // scrolls to, and it would satisfy every assertion above.
    expect(new Set(featureIds).size).toBe(featureIds.length);
  });

  it('puts each capability id on the control a fragment should land on', () => {
    // The id is on the stage's tab, which is also what the tabs pattern wants
    // for aria-labelledby — so one element is the anchor target, the accessible
    // name of the panel, and the thing that gets selected. Following the link
    // now SELECTS the stage rather than scrolling near it.
    expect(STAGES).toContain('id={stage.id}');
    expect(STAGES).toContain('aria-controls={`${stage.id}-panel`}');
    expect(STAGES).toContain('aria-labelledby={stage.id}');
    expect(STAGES).toContain("window.addEventListener('hashchange', sync)");
  });
});

describe('the homepage stops saying things twice', () => {
  it('keeps one navigation strip under the hero, not two', () => {
    // The four outcome badges (Plan & Schedule, Get Paid Faster, ...) were the
    // second of two link rows in the same screen, overlapping the first.
    expect(HOME).not.toContain('hero-pillars');
    expect(HOME).toContain('trust-strip');
  });

  it('has no standalone AI section re-explaining the flagship cards', () => {
    // It was first merged down to a four-step row under the cards, then removed
    // outright — the cards already say what the chain does, and a row repeating
    // "attract, qualify" under them was the same duplication in less space.
    expect(HOME).not.toContain('ai-split-story');
    expect(HOME).not.toContain('flow-strip');
  });

  it('does not name the client portal in the suite grid as well as demonstrating it', () => {
    // Read the array, not the file. A first pass asserted the string was absent
    // from the whole source and failed on the COMMENT explaining why the card
    // was removed — which is the test marking its own documentation as the bug.
    const array = HOME.slice(HOME.indexOf('const suite:'), HOME.indexOf('function SiteBuilderVisual'));
    const titles = [...array.matchAll(/\["([^"]+)",/g)].map((m) => m[1]);
    expect(titles).toHaveLength(7);
    expect(titles).not.toContain('Texts + client portal');
    // Still demonstrated in full, one section above.
    expect(HOME).toContain('client-experience');
  });

  it('gives every flagship card somewhere to go', () => {
    const hrefs = [...HOME.matchAll(/href:\s*"(\/features\/[a-z-]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      '/features/website-builder',
      '/features/ai-intake',
      '/features/quick-stops',
    ]);
  });
});
