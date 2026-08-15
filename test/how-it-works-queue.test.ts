import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * /how-it-works — the ranked-opportunity page.
 *
 * The environment is node and there is no DOM, so these read the source as
 * text. Two house rules apply and both matter here:
 *
 *   - CRLF. Every file is normalised before anything is matched, or a
 *     multi-line assertion passes on one machine and fails on another.
 *   - COMMENTS ARE STRIPPED. The comments in these files quote the strings
 *     being asserted — the CSS section header names the palette, and page.tsx
 *     spells out the verbs the page may use — so a bare toContain would match
 *     the explanation rather than the code.
 */

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const stripJs = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const stripCss = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const PAGE = stripJs(read('src/app/how-it-works/page.tsx'));
const CARDS = stripJs(read('src/app/how-it-works/opportunity-cards.tsx'));
const PHONE = stripJs(read('src/app/how-it-works/text-alert-demo.tsx'));
const NAV = stripJs(read('src/app/how-it-works/section-nav.tsx'));
const CHROME = stripJs(read('src/components/flagship/site-chrome.tsx'));
const CSS = stripCss(read('src/components/flagship/flagship.module.css'));

/** Everything a reader actually sees, across the page and its three widgets. */
const COPY = [PAGE, CARDS, PHONE].join('\n');

/**
 * The @media block a declaration actually lives in.
 *
 * CSS.indexOf('@media (max-width: 700px)') in a 6,000-line stylesheet finds
 * somebody else's block — there are several. Find the declaration first, then
 * scan backwards to the @media that opens above it.
 */
function mediaAround(needle: string): string {
  const at = CSS.indexOf(needle);
  expect(at, `not found in the stylesheet: ${needle}`).toBeGreaterThan(-1);
  const open = CSS.lastIndexOf('@media', at);
  expect(open).toBeGreaterThan(-1);
  return CSS.slice(open, CSS.indexOf('\n', at));
}

describe('what the page is allowed to claim', () => {
  /* Let's Get Quoted does not buy, sell or supply leads. Every request on this
     page arrives at the contractor's own website; the product qualifies it. A
     sentence that would also be true of a lead-gen marketplace is the wrong
     sentence, and this is the check that keeps it off the page. */
  const FORBIDDEN = [
    /\bbuy\s+leads?\b/i,
    /\bsell\s+leads?\b/i,
    /\bpurchase\s+leads?\b/i,
    /\blead\s+gen(eration)?\b/i,
    /\bshared\s+leads?\b/i,
    /\bwe\s+(send|supply|deliver|provide|bring)\s+you\s+(more\s+)?leads?\b/i,
    /\bleads?\s+delivered\b/i,
    /\bcost\s+per\s+lead\b/i,
    /\bexclusive\s+leads?\b/i,
  ];

  for (const pattern of FORBIDDEN) {
    it(`never says ${pattern.source}`, () => {
      expect(COPY).not.toMatch(pattern);
    });
  }

  it('describes what it does to a request in the permitted verbs', () => {
    expect(PAGE).toContain('qualifies every request');
    expect(PAGE).toContain('estimates its value');
    for (const verb of ['scored', 'surfaced', 'ranked']) {
      expect(COPY).toContain(verb);
    }
  });

  it('marks the invented numbers as invented', () => {
    expect(PAGE).toContain('Example opportunities');
    expect(PAGE).toMatch(/values and customers are illustrative/);
  });
});

describe('the copy the brief specified', () => {
  it('leads on the headline, in two parts', () => {
    expect(PAGE).toContain('Your best jobs <em>rise to the top.</em>'.replace(/</g, '<'));
    expect(PAGE).toMatch(/Your best jobs\s*<em>rise to the top\.<\/em>/);
  });

  it('carries the supporting sentence verbatim', () => {
    expect(PAGE.replace(/\s+/g, ' ')).toContain(
      'Your website qualifies every request, estimates its value and alerts you when a promising job needs an answer. Respond now—or save it for later.',
    );
  });

  it('uses the eyebrows the brief named', () => {
    for (const eyebrow of [
      'AI-ranked lead queue',
      'Worth your attention',
      'A quiet interruption',
      'The alert is only the beginning',
      'Before we text you',
      'Know what deserves your attention',
    ]) {
      expect(PAGE).toContain(eyebrow);
    }
  });

  it('offers the same two actions in the hero and at the close', () => {
    // "Start free" rather than the site-wide "Build my free site", and that is
    // deliberate: this page's ask is the whole workflow, not one artefact of
    // it. The website is not dropped from the promise — it moves into the line
    // under the button, where the rest of the terms already were.
    expect(PAGE.match(/Start free/g)?.length).toBe(2);
    expect(PAGE.match(/Explore the demo/g)?.length).toBe(2);
    expect(PAGE).toContain('Free website included · $0/month · Pay only when paid');
  });

  it('names the whole journey, in order, as one sequence', () => {
    /* THE SEQUENCE USED TO BE IMPLICIT AND THEN PRINTED TWICE.
       One invented $8,600 job runs from the hero to the closing receipt, which
       is the right idea — but over 5,300px of desktop the same numbers turning
       up in four places read as repetition rather than continuity, because
       nothing said out loud that it was the same job moving. And the bridge's
       five-card rail named beats 4, 5 and 6 a second time, 1,900px after the
       rail that names all six. One rail now, six beats, in order. */
    const beats = [...PAGE.matchAll(/title: '([A-Za-z ]+)', body:/g)].map((m) => m[1]);
    expect(beats).toEqual(['Request', 'Ranked', 'Texted', 'Quoted', 'Scheduled', 'Paid']);
    expect(PAGE).toContain('Request → Ranked → Texted → Quoted → Scheduled → Paid.');
    // The three the page has already shown, marked as shown.
    expect([...PAGE.matchAll(/done: true/g)]).toHaveLength(3);
    expect(PAGE).toContain("data-done={beat.done ? 'true' : 'false'}");
  });

  it('answers the two questions its own headline raises, under the headline', () => {
    /* "AI-ranked lead queue" asks a contractor how it knows and whether it will
       hide a good one. Both were answered 2,600px and three sections below the
       words that raised them, in a receipt captioned "why this job surfaced".
       Somebody unsure a machine is safe with their leads does not scroll. */
    const trust = PAGE.slice(PAGE.indexOf('const TRUST'), PAGE.indexOf('const JOURNEY'));
    expect(trust).toContain('It scores on rules you set');
    expect(trust).toContain('It demotes. It never hides');
    expect(trust).toContain('The value is an estimate, not your quote');
    // Above the opportunities section, which is where the old answer sat.
    expect(PAGE.indexOf('className="hiq-trust"')).toBeLessThan(PAGE.indexOf('id="opportunities"'));
  });

  it('describes the ranking the way the code actually behaves', () => {
    /* Checked against api/public/leads/route.ts, whose own comment reads
       "Flags demote; they never reject", and LEAD_PRUNE_FLAGS, which only ever
       writes score 'low'. Nothing is deleted, hidden or withheld. */
    const trust = PAGE.slice(PAGE.indexOf('const TRUST'), PAGE.indexOf('const JOURNEY'));
    expect(trust).toMatch(/does not mean you don’t get it/);
    expect(trust).toMatch(/lands on the same board/);
    expect(trust).not.toMatch(/\b(filters out|removes|deletes|blocks)\b/i);
    // The estimate is the AI's market range shaded by posture — NOT the
    // contractor's price book, which is what drafts a QUOTE. Naming the book
    // here would be a sentence about a different feature.
    expect(trust).not.toMatch(/price book/i);
    expect(trust).toMatch(/leans budget or premium/);
    expect(trust).toMatch(/shows no number\s+rather than a wrong one/);
  });

  it('calls the product by its whole name where it makes the promise', () => {
    // "Quoted carries it the rest of the way" reads as a different product.
    expect(PAGE).toContain('Let’s Get Quoted carries it the rest of the way.');
    expect(PAGE).not.toMatch(/job\.\s*Quoted carries/);
  });

  it('closes on the same job, paid, rather than on the wordmark', () => {
    expect(PAGE).toContain('PAID_ROWS');
    expect(PAGE).toContain("value: '✓ PAID IN FULL'");
    expect(PAGE).toContain('stamp="PAID"');
    // Both receipts carry the same money, because it is the same job.
    expect(PAGE.match(/total="\$8,600"/g)?.length).toBe(2);
    expect(PAGE).toContain('The same example request, eight days later');
  });

  it('prints the qualification signals on both receipts', () => {
    expect(PAGE).toContain("value: '$8,600 · HIGH'");
    expect(PAGE).toContain("value: '✓ 4.2 MILES'");
    expect(PAGE).toContain('BEST MATCH');
    expect(PAGE).toContain('WORTH A LOOK');
  });
});

describe('where the page sends you', () => {
  /* A claim as specific as "inside your service area" should be one click from
     the page that explains how that is decided. Relative hrefs, not the
     absolute letsgetquoted.com ones the brief wrote: these are routes in this
     same app, and an absolute URL to your own host is a needless round trip. */
  const FEATURE_LINKS = [
    ['/features/ai-intake', 'How AI Smart Intake ranks leads'],
    ['/features/quick-stops', 'Explore Quick Stops'],
    ['/features/back-office', 'See the connected back office'],
  ] as const;

  for (const [href, label] of FEATURE_LINKS) {
    it(`links "${label}" to ${href}`, () => {
      expect(CARDS).toContain(`href: '${href}'`);
      expect(CARDS).toContain(`label: '${label}'`);
    });
  }

  it('links the alert section to the client portal and the bridge to the back office', () => {
    expect(PAGE).toContain('href="/features/client-portal"');
    expect(PAGE).toContain('href="/features/back-office"');
    expect(PAGE).toContain('href="/features"');
  });

  it('sends the section that shows the ranking to the page that explains it', () => {
    // "Before we text you" shows the OUTPUT of the scoring and said nothing
    // about how any of its four lines is decided.
    expect(PAGE).toContain('href="/features/ai-intake"');
    expect(PAGE).toContain('See how AI Smart Intake scores a request');
  });

  it('makes each journey beat a link to the thing that does it', () => {
    const targets = [
      '/features/website-builder',
      '/features/ai-intake',
      '#text-alerts',
      '/features/quotes',
      '/features/scheduling',
      '/features/payments',
    ];
    for (const href of targets) expect(PAGE, href).toContain(`href: '${href}'`);
    // Every beat carries one — a card without an href renders an empty link.
    expect(PAGE).toContain('<Link href={beat.href}>');
  });

  /* Two of the five anchors are the same because scheduling and crew are one
     capability band on /features, not two. Asserted rather than left to look
     like a copy-paste slip. */
  it('sends each beat somewhere different, or the rail is decoration', () => {
    const journey = PAGE.slice(PAGE.indexOf('const JOURNEY'), PAGE.indexOf('/* THE LAST PIECE OF PAPER'));
    const hrefs = [...journey.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(6);
    expect(new Set(hrefs).size).toBe(6);
  });

  it('points both signup buttons at the shared signup constant, not the app root', () => {
    expect(PAGE).toContain('APP_SIGNUP_URL');
    expect(PAGE).not.toMatch(/href="https:\/\/app\.letsgetquoted\.com\/?"/);
  });

  it('every section the nav names exists as an id on the page', () => {
    for (const id of ['opportunities', 'text-alerts', 'back-office']) {
      expect(PAGE).toContain(`{ id: '${id}',`);
      expect(PAGE).toContain(`id="${id}"`);
    }
  });
});

describe('the demo controls', () => {
  it('gives both widgets a live region that exists before it has text', () => {
    for (const src of [CARDS, PHONE]) {
      expect(src).toContain('role="status"');
      // Rendered with an empty string rather than mounted on choice, so a
      // screen reader has the region in the tree when the text arrives.
      expect(src).toMatch(/\?[\s\S]{0,40}:\s*''/);
    }
  });

  it('labels each pair of answers with the job it belongs to', () => {
    expect(CARDS).toContain('role="group"');
    expect(CARDS).toMatch(/aria-label=\{`\$\{item\.question\} — \$\{item\.title\}`\}/);
    expect(PHONE).toContain('aria-label="Reply to the $8,600 panel upgrade alert"');
  });

  it('reports the chosen answer as pressed', () => {
    expect(CARDS.match(/aria-pressed=/g)?.length).toBe(2);
    expect(PHONE.match(/aria-pressed=/g)?.length).toBe(2);
  });

  it('gives every opportunity a "Later" that says what deferring does', () => {
    // Three cards plus the phone: four affirmative answers, four deferrals,
    // and none of them may lose the job.
    expect(CARDS.match(/later: '/g)?.length).toBe(3);
    expect(CARDS).not.toMatch(/later: '[^']*\b(lost|gone|expires?|forfeit)\b/i);
    expect(PHONE).toContain('later:');
  });

  it('never claims a demo button did something real', () => {
    for (const src of [CARDS, PHONE]) {
      expect(src).not.toMatch(/fetch\(|action=|<form/);
    }
  });
});

describe('the page chrome stays the site chrome', () => {
  it('draws the production header and footer, not its own', () => {
    expect(PAGE).toContain('<SiteHeader />');
    expect(PAGE).toContain('<SiteFooter />');
    expect(PAGE).toContain("from '@/components/flagship/site-chrome'");
  });

  it('keeps the header inside .root and the skip link before it', () => {
    const skip = PAGE.indexOf('skip-link');
    const header = PAGE.indexOf('<SiteHeader />');
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(header);
    expect(PAGE).toContain('styles.root');
  });

  it('lets the fixed mobile signup bar stand down over this page\'s own furniture', () => {
    // Both are matched positionally by site-chrome, so a page that renames one
    // of them silently gets a bar floating over its closing CTA.
    expect(CHROME).toContain('.hiq-nav');
    expect(CHROME).toContain('.hiq-final');
    expect(CHROME).not.toContain('hiw-stagenav');
  });
});

describe('metadata', () => {
  it('describes the ranked queue rather than the old five stages', () => {
    expect(PAGE).toContain("canonical: 'https://letsgetquoted.com/how-it-works'");
    expect(PAGE).toContain('Your best jobs rise to the top.');
    /* `absolute` + titleWithBrand: the root template's " · Let's Get Quoted"
       pushed this to 77 characters, and the brand is already the third word of
       the title itself. */
    expect(PAGE).toMatch(
      /title: \{ absolute: titleWithBrand\('How Let’s Get Quoted Works — your best jobs rise to the top'\) \}/,
    );
    expect(PAGE).not.toContain('Five stages');
    expect(PAGE).toContain("card: 'summary_large_image'");
  });
});

describe('the stylesheet', () => {
  it('sets the palette the brief specified', () => {
    for (const hex of ['#061a23', '#0c2731', '#12323d', '#f3efe7', '#ff5f22']) {
      expect(CSS).toContain(hex);
    }
  });

  it('cuts the torn edge out of each card\'s own paper colour', () => {
    // One variable, so a card on whiter stock does not get a cream tear.
    expect(CSS).toContain('--hiq-tear: var(--hiq-paper)');
    expect(CSS).toContain('--hiq-tear: var(--hiq-paper-2)');
    expect(CSS).toMatch(/linear-gradient\(135deg, transparent 7px, var\(--hiq-tear\) 0\)/);
  });

  it('runs the background shimmer behind the content and turns it off on request', () => {
    expect(CSS).toContain('animation: hiqAmbient');
    expect(CSS).toContain('@keyframes hiqAmbient');
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf('hiqAmbient')));
    expect(reduced).toContain('animation: none');
  });

  it('keeps the page from scrolling sideways without becoming a scroll container', () => {
    // overflow: hidden would make this box a scrollport, and the sticky nav
    // inside it would then stick to a box that never scrolls.
    const at = CSS.indexOf('.root:global(.hiq-page) {');
    expect(at).toBeGreaterThan(-1);
    const page = CSS.slice(at, CSS.indexOf('}', at));
    expect(page).toContain('overflow-x: clip');
    expect(page).not.toContain('overflow-x: hidden');
  });

  it('parks the sticky nav below the header at both header heights', () => {
    expect(CSS).toMatch(/\.hiq-nav[^{]*\{[^}]*top: 82px/);
    expect(mediaAround('.hiq-nav) { top: 68px')).toContain('max-width: 760px');
  });

  it('gives every demo button a 44px touch target', () => {
    expect(CSS).toMatch(/\.hiq-answers button\)[^{]*\{[^}]*min-height: 44px/);
  });

  it('stacks to one column on a phone and two on a tablet', () => {
    expect(mediaAround('.hiq-grid) { grid-template-columns: minmax(0, 1fr)')).toContain('max-width: 960px');
    expect(mediaAround('.hiq-rail) { grid-template-columns: repeat(2, minmax(0, 1fr))')).toContain('max-width: 960px');
    expect(mediaAround('.hiq-rail) { grid-template-columns: minmax(0, 1fr)')).toContain('max-width: 700px');
    expect(mediaAround('.hiq-facts) { grid-template-columns: minmax(0, 1fr)')).toContain('max-width: 700px');
  });

  it('puts the copy above the phone drawing once they stack', () => {
    expect(mediaAround('.hiq-text-copy) { order: -1')).toContain('max-width: 960px');
  });

  it('has no CSS left for the page this one replaced', () => {
    expect(CSS).not.toContain('hiw-');
    // The wordmark card at the foot of the page went with the receipt that
    // replaced it, and so did the double-ruled border it was the only user of.
    expect(CSS).not.toContain('hiq-final-ticket');
  });

  it('sets the receipt at reading size rather than caption size', () => {
    // It is the page's whole argument — four lines saying why a request is
    // worth stopping for — and it was 14px label over a 12px value.
    const row = CSS.slice(CSS.indexOf('.hiq-receipt-row) {'));
    expect(row.slice(0, row.indexOf('}'))).toContain('font-size: clamp(16px, 1.5vw, 18px)');
    const value = CSS.slice(CSS.indexOf('.hiq-receipt-row strong) {'));
    expect(value.slice(0, value.indexOf('}'))).toContain('font-weight: 700');
  });

  it('does not let the bubble\'s paragraph rule outrank the reply line', () => {
    // .hiq-bubble > p is (0,1,1) and .hiq-said is (0,1,0), so without the
    // :not() the answer comes out the same colour as the question.
    expect(CSS).toContain('.hiq-bubble > p:not(.hiq-said)');
  });

  it('keeps the two site-wide rules that section carried', () => {
    // Both outlived the page they arrived with: neither is scoped to it.
    expect(CSS).toContain('.root :global(footer > span) { font-size: 12px; }');
    expect(CSS).toContain('.root :global(.site-header[data-menu="open"] .header-cta)');
  });
});
