import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { FLEX_PRICE, LOWEST_PLATFORM_FEE } from '@/lib/pricing';

/**
 * /features, rebuilt around the journey and the price.
 *
 * WHAT THIS GUARDS, in order of how badly it would hurt:
 *
 *   THE PRICE IS IN THE HERO. "No monthly subscription" was the loudest line on
 *   the page and the platform fee that pays for it was 4,900px below it on a
 *   phone. Both were true; the order was the problem, because a price learned
 *   after the decision reads as a catch. Moving it back down would be a quiet
 *   change with nothing to fail.
 *
 *   THE PROOF STRIP CLAIMS NOTHING ABOUT ANYBODY'S BUSINESS. It is four facts
 *   about the product, all read out of code. The obvious "improvement" to it is
 *   an outcome — leads won, revenue added, stars — and we have no evidence for
 *   one. This asserts the absence.
 *
 *   THE FIVE ARE THE FIVE STAGES. The heading promises quoting; quoting had no
 *   card until this pass, and position 03 of a sequence about one job was a
 *   feature that happens between jobs.
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/** WHY comments quote the strings being asserted, so they have to come out. */
const strip = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAGE = read('src/app/features/page.tsx');
const CODE = strip(PAGE);
const CSS = read('src/components/flagship/flagship.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
const CHROME = read('src/components/flagship/site-chrome.tsx');

const HERO = CODE.slice(CODE.indexOf('<section className="index-hero'), CODE.indexOf('className="index-proof"'));

describe('the price is stated where the decision is made', () => {
  it('puts the fee under the hero CTA, not only in the closing band', () => {
    expect(HERO).toContain('index-hero-fee');
    expect(HERO).toContain('platform fee');
    expect(HERO).toContain('Flex starts at');
    // The order on the page: the fee note is after the buttons and before the
    // thread, so it is read as part of the offer rather than as a footnote.
    expect(HERO.indexOf('hero-actions')).toBeLessThan(HERO.indexOf('index-hero-fee'));
  });

  it('reads plan rates from the canonical public projection', () => {
    expect(HERO).toContain('{FLEX_PRICE.platformFee}');
    expect(HERO).toContain('{LOWEST_PLATFORM_FEE}');
    expect(FLEX_PRICE.platformFee).toBe('1.25%');
    expect(LOWEST_PLATFORM_FEE).toBe('0.10%');
    expect(HERO).toContain('{LOWEST_FEE_PLAN.name}');
    expect(HERO).not.toContain('on Pro');
  });

  it('says the fee applies only to a payment, and links to the detail', () => {
    expect(HERO).toContain('Compare exact prices and limits');
    expect(HERO).toContain('href="/pricing"');
  });

  it('wins the specificity fight the hero lede would otherwise take', () => {
    // `.index-hero-beside > p:not(.eyebrow)` is (0,3,1) — .root, the band, the
    // :not() class and the element. A tidy `> .index-hero-fee` is (0,3,0) and
    // loses, which would put the note in the lede's grid row on top of it.
    expect(CSS).toContain('.index-hero-beside > p.index-hero-fee)');
    expect(CSS).toMatch(/\.index-hero-beside\)\s*\{\s*grid-template-rows: 1fr auto auto auto auto auto 1fr/);
  });
});

describe('the proof strip proves things we can actually show', () => {
  const PROOF = CODE.slice(CODE.indexOf('const PROOF'), CODE.indexOf('const FAQ'));

  it('is four cells, and every number comes from code', () => {
    // `label: '` and not `{ stat:` — the type annotation above the array is a
    // fifth `{ stat:` and would make this count one cell that is not one.
    expect([...PROOF.matchAll(/label: '/g)]).toHaveLength(4);
    expect(PROOF).toContain('${TRADES.length} trades');
    expect(PROOF).toContain('${FEATURE_COUNT} features');
    expect(PROOF).toContain('PLAN_FEE_RANGE_LABEL');
  });

  it('makes no claim about a customer, a result or a rating', () => {
    // The line this strip must not cross. We have no testimonial we may quote,
    // no cohort and no measured lift, and an invented one costs us the rest of
    // the page.
    expect(PROOF).not.toMatch(/\b(customers?|contractors|businesses|users)\b\s*(served|trust|use)/i);
    expect(PROOF).not.toMatch(/\d+\s*%\s*(more|faster|increase)/i);
    expect(PROOF).not.toMatch(/\b\d+x\b/i);
    expect(PROOF).not.toMatch(/\b(rated|stars?|reviews?|testimonial|trusted by|award)\b/i);
    // No bare counts of people, which is the shape of the claim we cannot make.
    expect(PROOF).not.toMatch(/\b\d[\d,]*\+?\s*(contractors|customers|jobs|leads)\b/i);
  });
});

describe('the features section leads with the website and connects the four workflow stages', () => {
  const SITE_FEATURE = CODE.slice(CODE.indexOf('const WEBSITE_FEATURE'), CODE.indexOf('const WORKFLOW_FEATURES'));
  const WORKFLOW = CODE.slice(CODE.indexOf('const WORKFLOW_FEATURES'), CODE.indexOf('export default'));
  const workflowIds = [...WORKFLOW.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);

  it('runs website block → intake → quotes → scheduling → customer portal', () => {
    expect(SITE_FEATURE).toContain("id: 'website-builder'");
    expect(workflowIds).toEqual(['smart-intake', 'quotes', 'scheduling', 'client-portal']);
  });

  it('moves the previous homepage AI promise into the intake workflow card', () => {
    expect(CODE).toContain('const AI_INTAKE_WORKFLOW = BRAND_POSITIONING.workflowSteps[1]');
    expect(WORKFLOW).toContain('title: AI_INTAKE_WORKFLOW.title');
    expect(WORKFLOW).toContain('body: AI_INTAKE_WORKFLOW.description');
    expect(WORKFLOW).toContain('produces: AI_INTAKE_WORKFLOW.produces');
  });

  it('renders the featured Website block before the workflow features grid', () => {
    expect(CODE).toContain('<article');
    expect(CODE).toContain('className="website-featured"');
    expect(CODE).toContain('id={WEBSITE_FEATURE.id}');
    expect(CODE).toContain('<WebsiteFeaturePreview />');
    expect(CODE.indexOf('className="website-featured"')).toBeLessThan(CODE.indexOf('workflow-feature-grid'));
  });

  it('offers both site preview and deep-dive destinations for the website', () => {
    expect(SITE_FEATURE).toContain("demoHref: '/demo/sites'");
    expect(SITE_FEATURE).toContain("deepHref: '/features/website-builder'");
    expect(CODE).toContain('href={WEBSITE_FEATURE.demoHref}');
    expect(CODE).toContain('href={WEBSITE_FEATURE.deepHref}');
  });

  it('gives quoting a card, which the heading has always promised', () => {
    expect(WORKFLOW).toContain("title: 'Quotes and approvals'");
    expect(WORKFLOW).toContain("href: '/features/quotes'");
  });

  it('takes Quick Stops out of the sequence and gives it a band', () => {
    expect(WORKFLOW).not.toContain("id: 'quick-stops'");
    expect(CODE).toContain('<section className="route-band" id="quick-stops"');
    expect(CODE).toContain("href=\"/features/quick-stops\"");
    // Below the flagship index, not above it.
    expect(CODE.indexOf('className="flagship-index"')).toBeLessThan(CODE.indexOf('className="route-band"'));
  });

  it('still reaches the back office, which lost its card to the cream band', () => {
    expect(CODE).toContain('href="/features/back-office"');
    expect(CODE.indexOf('everything-index')).toBeLessThan(CODE.indexOf('/features/back-office'));
  });
});

describe('the objections are answered on the page that raises them', () => {
  const FAQ = CODE.slice(CODE.indexOf('const FAQ'), CODE.indexOf('export default'));

  it('covers all six', () => {
    for (const topic of [/platform fee cost me/i, /domain I already own/i, /setup actually take/i, /owns my customers/i, /do you hold my money/i, /just the website/i]) {
      expect(FAQ, String(topic)).toMatch(topic);
    }
  });

  it('answers the money question the way the product behaves', () => {
    // Stripe pays the contractor's own connected account; we never hold a
    // balance. This is the claim most expensive to get wrong.
    expect(FAQ).toMatch(/your own connected account/i);
    expect(FAQ).toMatch(/never see card numbers/i);
  });

  it('is rendered visibly, not just written', () => {
    expect(CODE).toContain('{FAQ.map(');
    expect(CODE).toContain('<summary>{item.q}</summary>');
    // No `name`: an exclusive accordion closes what you were reading and hides
    // every other answer from the browser's own find-in-page.
    expect(CODE).not.toMatch(/<details[^>]*\sname=/);
  });
});

describe('features metadata and acquisition attribution', () => {
  it('owns its social metadata rather than inheriting the homepage URL and image', () => {
    expect(CODE).toContain("const FEATURES_URL = 'https://letsgetquoted.com/features'");
    expect(CODE).toContain('url: FEATURES_URL');
    expect(CODE).toContain("url: '/product/jobs.webp'");
    expect(CODE).toContain("images: ['/product/jobs.webp']");
  });

  it('publishes structured product and visible FAQ data', () => {
    expect(CODE).toContain("'@type': 'SoftwareApplication'");
    expect(CODE).toContain("'@type': 'FAQPage'");
    expect(CODE).toContain('mainEntity: FAQ.map');
    expect(CODE).toMatch(/nonce=\{(?:await )?cspNonce\(\)|nonce=\{nonce\}/);
  });

  it('attributes conversion CTAs to the feature page and avoids stale catalog counts', () => {
    expect(CODE).toContain("buildSignupUrl({ source: 'feature_page' })");
    expect(CODE).toContain('href={FEATURE_SIGNUP_URL}');
    expect(CODE).toContain('triggerLabel="Browse the full feature catalog"');
    expect(CODE).not.toContain('100+ feature catalog');
  });
});

describe('the light band can be read', () => {
  it('colours every paragraph in it, not whichever one is last', () => {
    // MEASURED AT 1.97:1 on #f5f0e7. The correction already existed as
    // `> p:last-child`, and then a pill was appended after the lede and took
    // it: a positional selector is a fix any later sibling can steal in
    // silence. Written for every paragraph, with the pill more specific.
    expect(CSS).toContain('.everything-index .index-heading > p) { color: #4a5a63; }');
    expect(CSS).toContain('.everything-index .index-heading > p.everything-note) { color: #6b4a38; }');
  });
});

describe('the phone', () => {
  it('does not spend a quarter of the screen on a section label', () => {
    // Measured at 390x844: the block was 254px tall with a 42px headline
    // before the first card of the section appeared.
    const at = CSS.indexOf('.flagship-index .index-heading h2) { font-size: 29px');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(CSS.lastIndexOf('@media', at), at)).toContain('max-width: 560px');
  });

  it('gets the fixed bar out of the way of what is being read', () => {
    // data-redundant answers "is this offer already on screen", which is no
    // question at all in the middle of the page — where the bar was measured
    // sitting on a card's "Explore feature →" and on a stage tab.
    expect(CHROME).toContain("bar.setAttribute('data-scroll'");
    expect(CHROME).toContain("window.addEventListener('scroll', onScroll, { passive: true })");
    expect(CSS).toMatch(/\.mobile-cta\[data-scroll="down"\]\)\s*\{[^}]*opacity: 0/);
    expect(CSS).toMatch(/\.mobile-cta\[data-scroll="down"\]\)\s*\{[^}]*pointer-events: none/);
  });
});

/**
 * The real quote-builder screens on /features/quotes.
 *
 * TWO FAILURES LIVE HERE AND NEITHER SHOWS UP IN A BUILD. A missing asset
 * renders as an empty frame — the page returns 200 and nobody notices that the
 * thing the section exists to show is not there. And the section points at the
 * product's own screens, so the words around them are the only thing keeping
 * "here is the software" from drifting into "here is a customer".
 */
describe('the quote builder is shown, not drawn', () => {
  const QUOTES = strip(read('src/app/features/quotes/page.tsx'));
  const QCSS = read('src/app/features/quotes/quotes.module.css');
  /* The array alone. QUOTE_FLOW is declared above `export const metadata`, so a
     slice that runs to `export default` swallows the og:image and its
     1200x630 — which would make the size assertion below count a pair it does
     not mean. */
  const FLOW = QUOTES.slice(
    QUOTES.indexOf('const QUOTE_FLOW'),
    QUOTES.indexOf('];', QUOTES.indexOf('const QUOTE_FLOW')),
  );

  it('shows four steps, in the order you meet them', () => {
    expect([...FLOW.matchAll(/step: 'Step \d'/g)]).toHaveLength(4);
    expect(FLOW).toContain("step: 'Step 1'");
    expect(FLOW).toContain("step: 'Step 4'");
  });

  it('every file it names is on disk and not empty', () => {
    const named = [...QUOTES.matchAll(/\$\{SHOTS\}\/([\w.-]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThanOrEqual(5);
    for (const name of named) {
      expect(statSync(`public/media/quotes/${name}`).size, name).toBeGreaterThan(10_000);
    }
  });

  it('declares each capture at its real pixel size', () => {
    // This is what reserves the box before anything loads. A wrong number here
    // is a layout shift on the section the page's evidence lives in.
    // Read from QUOTE_FLOW only: the og:image above it is also a width/height
    // pair, and counting it would make this assert a number it does not mean.
    const declared = [...FLOW.matchAll(/width: (\d+),\s+height: (\d+),/g)].map(
      (m) => `${m[1]}x${m[2]}`,
    );
    expect(declared).toEqual(['1570x824', '432x452', '1568x770', '1191x794']);
  });

  it('costs nobody 400KB they did not ask for', () => {
    // The clip plays on its own and loops now — but not from the tag, and not
    // on load. ShotVideo starts it the first time the section is on screen, so
    // a visitor who never scrolls this far never fetches it. That component
    // owns the motion preference and the pause control; asserted in full in
    // test/quotes-shot-video.test.ts.
    expect(QUOTES).toContain('<ShotVideo');
    expect(QUOTES).not.toContain('<video');
    expect(QUOTES).not.toContain('autoPlay');
    const SHOT_VIDEO = read('src/app/features/quotes/ShotVideo.tsx');
    expect(SHOT_VIDEO).toContain('preload="none"');
    expect(SHOT_VIDEO).toContain('IntersectionObserver');
    expect(SHOT_VIDEO).toContain('controls');
  });

  it('says the numbers are invented and claims no customer', () => {
    const band = QUOTES.slice(QUOTES.indexOf('afterBenefits'), QUOTES.indexOf('stepsEyebrow'));
    expect(band).toMatch(/invented/i);
    expect(band).not.toMatch(/\b(testimonial|case study|our customer|success story|real customer)\b/i);
    expect(band).not.toMatch(/\d+\s*%\s*(more|faster|increase)/i);
  });

  it('scopes its CSS under .section-block, or the shell eats the margins', () => {
    // `.root ol { margin: 0; padding: 0 }` is (0,1,1) and a bare .shots is
    // (0,1,0). Five files in this codebase have lost that fight already.
    expect(QCSS).not.toMatch(/^\s*\.shots\s*\{/m);
    expect(QCSS).toContain(':global(.section-block) .shots');
    const narrow = QCSS.slice(QCSS.indexOf('@media (max-width: 860px)'));
    expect(narrow).toContain(':global(.section-block) .shot');
  });
});

/**
 * The product tour, across the middle of /features.
 *
 * WHAT COULD GO WRONG SILENTLY. A missing file renders as a poster that never
 * moves — the page returns 200 and nobody notices. And the whole point of the
 * two sources and the held-back src is that a visitor on a phone plan does not
 * pay 2.4MB for a section they may never reach; removing any part of that
 * mechanism looks identical on a desktop with a fast connection.
 */
describe('the page flow into the flagship index', () => {
  it('connects the proof strip into the flagship index', () => {
    expect(CODE.indexOf('className="index-proof"')).toBeLessThan(CODE.indexOf('className="flagship-index"'));
  });
});

describe('the website feature preview and accessibility', () => {
  const PREVIEW_SRC = strip(read('src/app/features/WebsiteFeaturePreview.tsx'));

  it('uses static next/image captures without client JS', () => {
    expect(PREVIEW_SRC).toContain('next/image');
    expect(PREVIEW_SRC).not.toContain("'use client'");
    expect(PREVIEW_SRC).not.toContain('<iframe');
  });

  it('preview assets exist on disk and are nonempty', () => {
    const desktopPath = 'public/media/website-builder/lawn-and-order/lawn-and-order-desktop-hero.jpg';
    const mobilePath = 'public/media/website-builder/lawn-and-order/lawn-and-order-mobile-hero.jpg';
    expect(statSync(desktopPath).size).toBeGreaterThan(10_000);
    expect(statSync(mobilePath).size).toBeGreaterThan(10_000);
  });

  it('maintains proper accessibility semantics on the preview', () => {
    expect(PREVIEW_SRC).toContain('<figure');
    expect(PREVIEW_SRC).not.toContain('aria-hidden="true"');
    expect(PREVIEW_SRC).toContain('<figcaption className="sr-only">');
  });

  it('has no nested anchors in the featured website block', () => {
    const featuredBlock = CODE.slice(CODE.indexOf('className="website-featured"'), CODE.indexOf('workflow-feature-grid'));
    // The outer element is an article rather than a parent Link/a wrapping child Links
    expect(CODE).toContain('<article');
    expect(CODE).toContain('className="website-featured"');
    expect(CODE).not.toMatch(/<Link\b[^>]*className="website-featured"/);
    expect(CODE).not.toMatch(/<a\b[^>]*className="website-featured"/);
    expect(featuredBlock).not.toMatch(/<Link\b[^>]*>(?:(?!<\/Link>)[\s\S])*?<Link\b/);
    expect(featuredBlock).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/);
  });
});

