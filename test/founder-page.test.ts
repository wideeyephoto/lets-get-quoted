import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * /founder, rebuilt as a founder LETTER rather than a product tour.
 *
 * The page it replaced was accurate and far too long: a field-by-field diagram
 * of one intake row moving between five database tables, and a twelve-row
 * reprint of the entire feature catalogue beside the price dial. Both were
 * true. Neither belonged on the page where a stranger decides whether to trust
 * the person who built the thing.
 *
 * So most of what is asserted here is SHAPE and RESTRAINT — eight sections in
 * one order, one H1, one sticky control, one photograph, and the specific long
 * blocks that must not come back. The copy assertions are limited to the lines
 * the brief supplied word for word, plus the one paragraph whose TENSE is
 * load-bearing.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Comments stripped first, and on this page that is not a nicety: the file
   headers deliberately NAME the things that were removed (".catalogue",
   ".travel", "MarketingHeader") so nobody goes hunting for them. A bare
   toContain would match the epitaph instead of the corpse. */
const RAW_PAGE = read('src', 'app', 'founder', 'page.tsx');
const PAGE = stripJs(RAW_PAGE);
const CSS = stripCss(read('src', 'app', 'founder', 'founder.module.css'));
const LAYOUT = read('src', 'app', 'founder', 'layout.tsx');

/** The body of a rule. Tolerates indentation, so a rule nested in an @media
 *  block is reachable by the same name as a top-level one. */
function ruleFor(selector: string): string {
  const start = CSS.search(new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  expect(start, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

/** Source position of a marker, asserting it exists. */
function at(marker: string): number {
  const index = PAGE.indexOf(marker);
  expect(index, `${marker} is not on the page`).toBeGreaterThan(-1);
  return index;
}

/* ===========================================================================
   1. The letterhead
   ======================================================================== */
describe('the hero is a note from a person', () => {
  it('says who is talking before it says anything else', () => {
    expect(PAGE).toContain('<p className="eyebrow">A note from Brett, founder</p>');
    // .eyebrow is `text-transform: uppercase` in globals, which is why the
    // constant is sentence case and the rendered line is not.
  });

  it('carries the headline the brief asked for, split so half can take the accent', () => {
    expect(PAGE).toContain('I built Let’s Get Quoted so a one-truck business can look—and run—like');
    expect(PAGE).toContain('<em>a much bigger company.</em>');
  });

  it('and the accent agrees with the button under it', () => {
    // The rest of the page emphasises in --gold-ink, which survives a theme
    // flip; this hero is dark-only and should match its own primary action.
    expect(ruleFor('.portraitHero .title em')).toContain('color: var(--accent)');
  });

  it('offers the two actions the brief named, and no third', () => {
    expect(PAGE).toContain("spec={{ label: 'Build my free site' }}");
    expect(PAGE).toContain('href="#my-story"');
    expect(PAGE).toContain('Read my story');
    // …and the anchor has to land somewhere.
    expect(PAGE).toContain('id="my-story"');
    // Under a fixed header, so the target needs the clearance.
    expect(ruleFor('.storyAnchor')).toContain('scroll-margin-top');
  });

  it('states the three terms in the hero rather than saving them for /pricing', () => {
    expect(PAGE).toContain("const HERO_POINTS = ['No card', 'Start at $0/month', 'One connected product']");
  });
});

/* ===========================================================================
   2. The photograph — the thing the last version of this page did not have
   ======================================================================== */
describe('the portrait is a real photograph', () => {
  it('the file is committed and reachable at the path the page asks for', () => {
    const file = join(process.cwd(), 'public', 'founder', 'brett-workshop.jpg');
    expect(existsSync(file), 'public/founder/brett-workshop.jpg is missing').toBe(true);
    // A tripwire, not a budget: a few hundred KB is a photograph, a few KB is
    // a placeholder somebody swapped in, and 5MB is an unresized camera file.
    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('is rendered through next/image with its real intrinsic size', () => {
    expect(PAGE).toContain("src=\"/founder/brett-workshop.jpg\"");
    // The intrinsic ratio has to be the file's own or next/image reserves the
    // wrong box and the hero shifts as it loads.
    expect(PAGE).toContain('width={1122}');
    expect(PAGE).toContain('height={1402}');
    expect(PAGE).toContain('sizes=');
  });

  it('preloads, because it is above the fold on every width', () => {
    expect(PAGE).toContain('priority');
  });

  it('describes the person, since it depicts one', () => {
    // The old placeholder was aria-hidden — correct then, because it depicted
    // nothing. A real portrait with an empty alt would be a face the page
    // never mentions to anyone who cannot see it.
    expect(PAGE).toContain('alt="Brett, founder of Let’s Get Quoted, standing at a workbench in a workshop"');
    expect(PAGE).not.toContain('<div className={styles.portraitSlot} aria-hidden="true" />');
  });

  it('no trace of the placeholder is left behind', () => {
    expect(PAGE).not.toContain('Portrait to come');
    expect(CSS).not.toContain('.portraitSlotNote');
    expect(CSS).not.toContain('.portraitSlotGlyph');
  });

  it('keeps the crop and the fade that were written for it', () => {
    const slot = ruleFor('.portraitSlot');
    expect(slot).toContain('object-fit: cover');
    expect(slot).toContain('object-position');
    expect(slot).toContain('filter: grayscale(1)');
    expect(slot).toContain('mask-image: linear-gradient(90deg, transparent 0%, #000 38%)');
    expect(slot).toContain('-webkit-mask-image');
  });
});

/* ===========================================================================
   3. Eight sections, in one order
   ======================================================================== */
describe('the eight-section flow', () => {
  const ORDER = [
    'id="founder-title"',
    'id="founder-start-title"',
    'id="founder-broken-title"',
    'id="founder-idea-title"',
    'id="founder-who-title"',
    'id="founder-model-title"',
    'id="founder-promise-title"',
    '<MarketingCta',
  ];

  it('runs hero → start → broken → idea → who → model → promise → CTA', () => {
    const positions = ORDER.map(at);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('has exactly one H1 and it is the hero', () => {
    expect(RAW_PAGE.match(/<h1\b/g)).toHaveLength(1);
    expect(PAGE).toContain('<h1 id="founder-title"');
  });

  it('every section names its own heading, so the landmark list is readable', () => {
    // Seven <section> elements here; the eighth section is MarketingCta, which
    // labels itself.
    const sections = PAGE.match(/<section[^>]*>/g) ?? [];
    expect(sections.length).toBe(7);
    for (const tag of sections) {
      expect(tag, tag).toContain('aria-labelledby=');
    }
  });

  it('does not skip a heading level: h3 only ever appears under an h2', () => {
    const firstH2 = at('<h2 id="founder-start-title"');
    const firstH3 = PAGE.indexOf('<h3');
    expect(firstH3).toBeGreaterThan(firstH2);
    expect(PAGE).not.toContain('<h4');
  });
});

/* ===========================================================================
   4. What was cut, and must not creep back
   ======================================================================== */
describe('the two long blocks are gone', () => {
  it('the field-by-field intake diagram is not on the page', () => {
    for (const gone of ['INTAKE_FIELDS', 'TRAVEL_STOPS', 'TRAVEL_STAYS', 'ExampleFrame']) {
      expect(PAGE, gone).not.toContain(gone);
    }
    for (const gone of ['.travelFrame', '.stopsWrap', '.fieldLabel', '.chips']) {
      expect(CSS, gone).not.toContain(gone);
    }
  });

  it('the twelve-row feature catalogue is not on the page', () => {
    // /pricing owns those numbers. Reprinting them under a founder letter was
    // the single longest thing on the page on a phone.
    expect(PAGE).not.toContain('FEATURE_CATEGORIES');
    expect(PAGE).not.toContain('FEATURE_COUNT');
    for (const gone of ['.catalogueHead', '.catRow', '.catCount']) {
      expect(CSS, gone).not.toContain(gone);
    }
  });

  it('but the $0 dial it sat beside is still there, with a way to the real numbers', () => {
    expect(PAGE).toContain('<PriceZeroDial variant="lead"');
    expect(PAGE).toContain('href="/pricing"');
    expect(PAGE).toContain('See pricing details');
  });

  it('replaces the diagram with five named stages in order', () => {
    const steps = ['Request', 'Qualified lead', 'Accepted quote', 'Scheduled job', 'Payment'];
    const positions = steps.map((step) => at(`step: '${step}'`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // An <ol>, because they are stages rather than a set.
    expect(PAGE).toContain('<ol className={styles.flow}>');
  });

  it('and the arrows between them are CSS, so they are not read out five times', () => {
    expect(ruleFor('.flowStep:not(:last-child)::after')).toContain("content: '→'");
    // Not in the markup. Scoped to the list: the page has one other arrow, on
    // the "See pricing details" link, and that one is a decorative <span
    // aria-hidden> inside a single link rather than punctuation repeated
    // between five siblings.
    const list = PAGE.slice(at('<ol className={styles.flow}>'), at('</ol>'));
    expect(list).not.toContain('→');
  });
});

/* ===========================================================================
   5. Honesty about what does not exist yet
   ======================================================================== */
describe('nothing is promised in the present tense that is not shipped', () => {
  it('the forward-looking paragraph stays forward-looking', () => {
    const direction = PAGE.slice(at('const DIRECTION ='), at('const PLEDGES'));
    // The brief asked for the AI language to read as mission and direction.
    // These three are what makes it read that way; losing them turns a
    // roadmap into a feature list.
    expect(direction).toMatch(/goes next/i);
    expect(direction).toMatch(/direction I am building in/i);
    expect(direction).toMatch(/when each piece lands/i);
  });

  it('and no section claims an AI capability as available', () => {
    // A blunt check on purpose. If a future edit wants to say the product
    // does something automatically, it should have to change this test and
    // think about whether the claim is true.
    expect(PAGE).not.toMatch(/\bAI\b/);
    expect(PAGE).not.toMatch(/automatically (writes|drafts|answers|quotes)/i);
  });

  it('keeps the one gap in the five-step chain out loud', () => {
    // convertLeadToJob does not pass photoPaths to createJob. Drawing the
    // photos travelling would be the easy lie.
    expect(PAGE).toContain('const FLOW_NOTE =');
    expect(PAGE).toMatch(/photos stay on the request/i);
  });
});

/* ===========================================================================
   6. Chrome, destinations and the one sticky control
   ======================================================================== */
describe('the page keeps the shared chrome and the shared destinations', () => {
  it('draws exactly one header, from the layout', () => {
    expect(LAYOUT).toContain('public-header-layout');
    // The page must not draw a second one of its own. This page carried
    // <MarketingHeader /> while the layout also mounted PublicHeaderLayout,
    // which is two headers on one route.
    expect(PAGE).not.toContain('MarketingHeader');
    expect(PAGE).not.toContain('<SiteHeader');
  });

  it('the primary action still points at the shared signup constant', () => {
    expect(PAGE).toContain('APP_SIGNUP_URL');
    // Never a hand-typed app URL — the constant carries ?intent=signup, and a
    // page that guesses lands the reader on a form headed "Sign in".
    expect(PAGE).not.toMatch(/https:\/\/app\.letsgetquoted\.com/);
  });

  it('closes with the shared CTA band rather than a bespoke one', () => {
    expect(PAGE).toContain('<MarketingCta');
    expect(PAGE).toContain('<SiteFooter />');
  });

  it('has exactly one persistent mobile control', () => {
    expect(RAW_PAGE.match(/<StickyCta\b/g)).toHaveLength(1);
    // And nothing else on the page pins itself to the viewport.
    expect(CSS).not.toContain('position: fixed');
    expect(CSS).not.toContain('position: sticky');
  });
});

/* ===========================================================================
   7. Metadata
   ======================================================================== */
describe('metadata', () => {
  it('titles the page as the letter it is', () => {
    expect(PAGE).toContain("title: 'A note from Brett, founder'");
    expect(PAGE).toContain("canonical: 'https://letsgetquoted.com/founder'");
  });

  it('spells out the social card, because the title template does not reach it', () => {
    // Without these, a shared link reads "The website, CRM & payments platform
    // built for contractors" — the site's pitch, not this page's.
    const meta = PAGE.slice(at('export const metadata'), at('const HERO_LEDE'));
    expect(meta).toContain('openGraph');
    expect(meta).toContain('twitter');
    expect(meta).toMatch(/title: 'A note from Brett, founder · Let’s Get Quoted'/);
    expect(meta).toContain("url: 'https://letsgetquoted.com/founder'");
  });
});

/* ===========================================================================
   8. Responsive and reduced motion
   ======================================================================== */
describe('it works on a phone', () => {
  it('collapses the hero to one column and displays the portrait visibly without masking', () => {
    const mobile = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
    expect(mobile).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(mobile).toContain('mask-image: none');
    // The portrait must not keep a 30rem min-height on a phone.
    expect(mobile).toContain('min-height: 0');
  });

  it('nothing reorders the stack away from DOM order', () => {
    // An order:2 on one grid child and none on its sibling is how the previous
    // rebuild landed a pull quote above the picture it was meant to close.
    const block = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
    // Scoped to the media block, and a boundary before `order:` — a plain
    // substring match reports every `border:` in the file as a reorder.
    expect(block.slice(0, block.indexOf('\n}\n'))).not.toMatch(/(^|[^-\w])order:/);
  });

  it('gives the two inline links a real touch target', () => {
    for (const selector of ['.readStory', '.pricingLink']) {
      expect(ruleFor(selector), selector).toContain('min-height: 44px');
    }
  });

  it('turns the five steps into rows once they are a single column', () => {
    // 430 rather than 720: above it the grid still fits two or three columns
    // and the steps really are cards side by side. At 429 and below it is one
    // column, and five bordered boxes is 695px of chrome around five short
    // paragraphs. Every phone in normal use — 375, 390, 393, 414, 428 — is
    // under this line.
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 430px)'));
    expect(phone, 'no 430px block').toBeTruthy();
    expect(phone).toContain('grid-template-columns: 1.85rem minmax(0, 1fr)');
    // The box goes away; a hairline takes over as the separator.
    expect(phone).toMatch(/\.flowStep[\s\S]{0,320}border: 0;/);
    expect(phone).toMatch(/\.flowStep[\s\S]{0,320}border-bottom: 1px solid/);
  });

  it('tightens the shared section chrome through a page-scoped hook, not globally', () => {
    // .section-block belongs to every marketing route. Overriding it bare
    // would reflow /pricing and /faq from a file named founder.module.css.
    expect(CSS).toContain('.page :global(.section-block)');
    expect(PAGE).toContain('${styles.page}');
    // And the hook has to declare something real — an empty rule is dropped by
    // the CSS module pipeline and `styles.page` comes back undefined, which
    // renders the literal string "undefined" into the class list.
    expect(ruleFor('.page')).toMatch(/[a-z-]+:\s*\S+/);
  });

  it('drops the card lift when motion is reduced', () => {
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('transform: none');
  });
});
