import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { FEE_TIERS } from '@/lib/pricing';

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
    expect(HERO).toMatch(/No card, setup fee, or monthly subscription/);
    // The order on the page: the fee note is after the buttons and before the
    // thread, so it is read as part of the offer rather than as a footnote.
    expect(HERO.indexOf('hero-actions')).toBeLessThan(HERO.indexOf('index-hero-fee'));
  });

  it('reads both rates from FEE_TIERS rather than typing them', () => {
    // A typed "1.25%" here is a number that keeps its value after /pricing
    // changes its mind, and nothing would fail.
    expect(HERO).toContain('{LOWEST_FEE}–{HIGHEST_FEE}');
    expect(CODE).toContain('const HIGHEST_FEE = FEE_TIERS[0].rate');
    expect(CODE).toContain('const LOWEST_FEE = FEE_TIERS[FEE_TIERS.length - 1].rate');
    expect(FEE_TIERS[0].rate).toBe('1.25%');
    expect(FEE_TIERS[FEE_TIERS.length - 1].rate).toBe('0.65%');
  });

  it('says the fee applies only to a payment, and links to the detail', () => {
    expect(HERO).toMatch(/applies only when a homeowner pays you/);
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
    expect(PROOF).toContain('${LOWEST_FEE}–${HIGHEST_FEE}');
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

describe('the five cards are the five stages of a job', () => {
  const FLAG = CODE.slice(CODE.indexOf('const FLAGSHIPS'), CODE.indexOf('export default'));
  const ids = [...FLAG.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);

  it('runs website → intake → quotes → scheduling → customer', () => {
    expect(ids).toEqual(['website-builder', 'smart-intake', 'quotes', 'scheduling', 'client-portal']);
  });

  it('gives quoting a card, which the heading has always promised', () => {
    expect(FLAG).toContain("title: 'Quotes and approvals'");
    expect(FLAG).toContain("href: '/features/quotes'");
    expect(CODE).toContain('quote faster');
  });

  it('takes Quick Stops out of the sequence and gives it a band', () => {
    // A Quick Stop is not a stage of a job; it is a second, smaller job sold
    // into the gap between two of them, and in position 03 it broke a sequence
    // on the page that sells the sequence.
    expect(FLAG).not.toContain("id: 'quick-stops'");
    expect(CODE).toContain('<section className="route-band" id="quick-stops"');
    expect(CODE).toContain("href=\"/features/quick-stops\"");
    // Below the five, not above them.
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
    // Nothing autoplays, so there is no motion preference to respect — and
    // preload="none" behind a poster means the clip is fetched by the press.
    expect(QUOTES).toContain('preload="none"');
    expect(QUOTES).toContain('controls');
    expect(QUOTES).not.toContain('autoPlay');
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
