import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * EVERY FEATURE PAGE UNFURLS AS ITSELF.
 *
 * All five inherited the root layout's Open Graph object, and Next only
 * replaces that object if the child declares one — so a share of
 * /features/quick-stops produced the homepage's title, the homepage's
 * description, a screenshot of a website template, and an og:url pointing at
 * letsgetquoted.com. The card sent people to a different page than the link.
 *
 * This is the kind of failure nothing else catches: it type-checks, it builds,
 * it renders, and it is only visible in somebody else's Slack.
 */

/** The five flagship pages, and the seven suite pages the homepage links at. */
const SLUGS = [
  'website-builder',
  'ai-intake',
  'quick-stops',
  'client-portal',
  'back-office',
  'quotes',
  'scheduling',
  'crew',
  'payments',
  'recurring',
  'cash-flow',
  'reviews',
];

const source = (slug: string) =>
  readFileSync(`src/app/features/${slug}/page.tsx`, 'utf8').replace(/\r\n/g, '\n');

/** Just the metadata export — the page body quotes plenty of URLs of its own. */
const meta = (slug: string) => {
  const src = source(slug);
  const at = src.indexOf('export const metadata');
  expect(at, slug).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('\n};', at));
};

describe.each(SLUGS)('/features/%s', (slug) => {
  const block = meta(slug);

  it('declares its own canonical, og:url and twitter card', () => {
    expect(block).toContain(`canonical: 'https://letsgetquoted.com/features/${slug}'`);
    expect(block).toContain(`url: 'https://letsgetquoted.com/features/${slug}'`);
    expect(block).toContain("card: 'summary_large_image'");
  });

  it('ships a social image of its own, at the size every scraper crops to', () => {
    expect(block).toContain(`/features/og-${slug}.jpg`);
    expect(block).toContain('width: 1200');
    expect(block).toContain('height: 630');
    const path = `public/features/og-${slug}.jpg`;
    expect(existsSync(path), path).toBe(true);
    // Facebook and LinkedIn both refuse to fetch cards over 8MB, and a card
    // nobody can fetch is the same as no card.
    expect(statSync(path).size).toBeLessThan(1_000_000);
  });

  it('does not fall back on the homepage template image', () => {
    expect(block).not.toContain('/template-previews/');
  });

  it('says something about THIS page in the card copy', () => {
    // The failure mode is a copy-paste from a sibling, which is silent.
    const titles = [...block.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
    expect(titles.length).toBeGreaterThanOrEqual(3); // page, og, twitter
    for (const title of titles) expect(title.length).toBeGreaterThan(8);
    const descriptions = [...block.matchAll(/'([^']{60,})',/g)].map((m) => m[1]);
    expect(descriptions.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves the brand suffix to the root layout', () => {
    // The template is "%s · Let's Get Quoted", so naming the brand in the page
    // title renders it twice.
    const pageTitle = block.match(/^\s*title: '([^']+)',$/m)?.[1] ?? '';
    expect(pageTitle, slug).not.toMatch(/Let’s Get Quoted|Let's Get Quoted/);
  });
});

describe('the cards themselves', () => {
  it('are generated from the pages, not drawn by hand', () => {
    const script = readFileSync('scripts/build-feature-og.mjs', 'utf8');
    for (const slug of SLUGS) expect(script).toContain(`slug: '${slug}'`);
  });

  it('never claim anything the pages do not', () => {
    // No customer counts, no ratings, no "trusted by" — the same rule the
    // trust strip on /for is held to.
    const script = readFileSync('scripts/build-feature-og.mjs', 'utf8');
    const cards = script.slice(script.indexOf('const CARDS'), script.indexOf('/** The real mark'));
    expect(cards).not.toMatch(/\b\d+[,\d]*\+? (contractors|customers|users|businesses)\b/i);
    // The CLAIM shape, not the noun. "reviews" used to be banned outright, which
    // stopped being right the moment a page was about them: /features/reviews is
    // titled "More reviews, without gaming the reviews." What must never appear
    // is a count, a score or a badge we cannot substantiate.
    expect(cards).not.toMatch(/trusted by|award[- ]winning/i);
    expect(cards).not.toMatch(/\b\d[\d,]*\+?\s*(reviews|ratings|stars)\b/i);
    expect(cards).not.toMatch(/\brated\s*\d|\b\d(\.\d)?\s*(out of|\/)\s*5\b/i);
  });
});

/**
 * THE THINGS YOU TAP ON A PHONE.
 *
 * All three live in the chrome every marketing page shares, so one regression
 * here is a regression on nine pages. Measured at 390x844 before §108:
 * .header-cta 129x36, .nav-toggle 37x44, .detail-back 108x13.
 */
describe('tap targets in the shared chrome', () => {
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('gives the signup button, the menu and the breadcrumb a real target', () => {
    expect(CSS).toMatch(/\.header-cta\)\s*\{[^}]*min-height: 44px/);
    expect(CSS).toMatch(/\.nav-toggle\)\s*\{[^}]*min-width: 44px[^}]*min-height: 44px/);
    // The breadcrumb's label stays 10px; the height is padding, and the margin
    // underneath gives it back so nothing on the page moves.
    expect(CSS).toMatch(/\.detail-back\)\s*\{[^}]*padding-block: 16px/);
  });

  it('makes the wordmark yield, not the button', () => {
    // A 44px minimum stops the button being SHORT. Nothing stopped it being
    // NARROW: the header is a flex row, every item defaults to flex-shrink: 1,
    // and the browser took the missing width from the widest item that would
    // give. Measured at 390x844: "Build my free site →" was 144px of content
    // in a 121px box, so the arrow and the right-hand padding were gone; at
    // 320 the pill was a circle reading "Build m". The label is nowrap by
    // design, so a narrower box does not reflow it, it truncates it.
    expect(CSS).toMatch(/\.header-cta\)\s*\{[^}]*flex: 0 0 auto/);
    // And something has to give instead. The logo is the only item in the row
    // that can lose width without losing meaning, so below 430 it is sized by
    // width and scales — the base rule is height: 40px, width: auto, which
    // cannot shrink at all.
    expect(CSS).toMatch(/\.site-header \.brand-logo\)\s*\{[^}]*width: clamp\(88px, 30vw, 147px\)/);
  });

  it('keeps the fixed bar out of the home-indicator area', () => {
    expect(CSS).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('reserves the bar\'s height at the end of the page', () => {
    expect(CSS).toMatch(/padding-bottom: 78px/);
  });
});

/**
 * THE SECOND BUTTON IN EVERY FEATURE HERO.
 *
 * Each of these pages offers a way to see the thing before signing up for it.
 * Two failures were possible and both happened: the button said "Build my free
 * site" on a page about something else, and the section it pointed at arrived
 * underneath the fixed header — measured at y=0 on all three.
 */
describe('the feature hero CTAs', () => {
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  /**
   * These three used to open on a signup and point their SECOND button at an
   * on-page section. They lead with the live thing now — see the hero-template
   * block in suite-feature-pages.test — so what is checked here is the
   * remaining on-page anchor, which is the part the scroll-margin rule below
   * has to keep clear of the fixed header.
   */
  const ANCHORS: [string, string][] = [['quick-stops', '#how-it-works']];

  it.each(ANCHORS)('%s points at a section that exists (%s)', (slug, href) => {
    const src = source(slug);
    expect(src).toContain(`href: '${href}' }}`);
    // The id belongs on the section rather than on the heading — that is what
    // carries the scroll-margin.
    expect(src).toContain(`id="${href.slice(1)}"`);
  });

  it('lands those sections clear of the fixed header at both its heights', () => {
    // Two selectors share each rule now: .section-block[id] for the children a
    // feature page adds, and .detail-story[id] for the one the shared layout
    // renders — website-builder's "See how it works" points at that one.
    expect(CSS).toMatch(/\.detail-story\[id\]\)\s*\{ scroll-margin-top: 104px/);
    expect(CSS).toMatch(/\.detail-story\[id\]\)\s*\{ scroll-margin-top: 88px/);
    expect(CSS).toContain('.section-block[id]),');
  });
});

/**
 * /features/website-builder, rebuilt against the approved reference.
 *
 * The page was 1,817 words of eight steps and six benefits that said one thing
 * six ways. What is protected here is the compression — that it stayed
 * compressed — and the claims, which all had to survive it unchanged.
 */
describe('the website builder page', () => {
  const SRC = readFileSync('src/app/features/website-builder/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('leads on the outcome rather than on the transition', () => {
    expect(SRC).toContain('A contractor website that turns visits into');
    expect(SRC).toContain('ready-to-quote jobs.');
    expect(SRC).not.toContain('Go from no website to');
  });

  it('asks for three answers, and shows three', () => {
    // It said "Three answers. One complete site." above a list of four for two
    // releases — the fourth being "review, personalize and publish", which is
    // the section immediately below it rather than an answer you supply.
    const steps = SRC.slice(SRC.indexOf('steps={['), SRC.indexOf('cta={{'));
    expect([...steps.matchAll(/title: '/g)].length).toBe(3);
    for (const s of ['Your business name', 'Your trade', 'Your service area']) {
      expect(steps).toContain(s);
    }
    expect(SRC).toContain('stepsEyebrow="Three answers. One complete site."');
  });

  it('carries no step number in prose that a list somewhere else owns', () => {
    // "Step seven and step eight" survived the eight-to-four compression and
    // "entered in step four" survived the four-to-three one. A number written
    // into a sentence about a list on the same page is a number nobody
    // renumbers, so the page names what happens instead of where it sits.
    expect(SRC).not.toMatch(/step (one|two|three|four|five|six|seven|eight|\d)/i);
  });

  /**
   * SIX BENEFITS BECAME THREE, AND THEN NONE.
   *
   * The three that survived the first cut were "look established from click
   * one", "answer how much while interest is high" and "receive a request you
   * can act on" — the hero's promise, then two of the four journey beats, with
   * the story paragraph above them making the same case a fourth time. The band
   * is gone rather than shortened, and the layout gained the optional props
   * that let a page drop it.
   */
  it('drops the story band rather than repeating the hero in it', () => {
    expect(SRC).not.toContain('benefits={[');
    expect(SRC).not.toContain('story={{');
    expect(SRC).not.toContain('A beautiful site should be the beginning');
    const LAYOUT = readFileSync('src/components/marketing/feature-detail-layout.tsx', 'utf8');
    expect(LAYOUT).toContain('{story || benefits.length ? (');
  });

  it('draws the journey and the one comparison', () => {
    for (const beat of ['Visit', 'Qualify', 'Estimate', 'Win the job']) {
      expect(SRC).toContain(`title: '${beat}'`);
    }
    expect(SRC).toContain('Contact form submitted');
    expect(SRC).toContain('Quote-ready request received');
  });

  it('answers the practical questions with disclosures that work unhydrated', () => {
    // ALL SIX CLOSED. The first was open so the section did not read as a list
    // of headings — an argument for a section arriving after two thousand words
    // of pitch. After the cut it arrives sooner, and one open answer is an
    // answer every other reader scrolls past to find theirs.
    expect(SRC).toContain('<details key={item.q}>');
    expect(SRC).not.toMatch(/<details[^>]*open=/);
    // No `name`: an exclusive accordion hides five answers from find-in-page.
    expect(SRC).not.toMatch(/<details[^>]*name=/);
    // SIX now, not five. The page was repositioned around the video studio —
    // eyebrow, lede and a benefit — and a page that claims video and never
    // answers "what kind of video, and what will actually play" leaves its one
    // new claim hanging. The other five are unchanged.
    expect([...SRC.matchAll(/^\s+q: '/gm)].length).toBe(6);
    expect(SRC).toContain('What kind of video can I add?');
  });

  it('keeps the claims that were already checked against the product', () => {
    // The CNAME target is the real one (lib/domains.ts) and the trade count is
    // computed rather than typed.
    expect(SRC).toContain('domains.letsgetquoted.com');
    expect(SRC).toContain('TRADES.length');
  });

  /**
   * THE FEE IS NOT RESTATED HERE ANY MORE, WHICH IS WHY THE LINK IS PINNED.
   *
   * The page used to carry the schedule twice — in the cost answer and in the
   * closing band — built from FEE_TIERS so it could not go stale. The rewrite
   * dropped both to "a platform fee when a homeowner pays you, plus Stripe
   * processing", which is true at every tier. That is only honest while the
   * page still points somewhere that names the numbers, so the pointer is the
   * thing under test, and so is the absence of a hand-typed rate.
   */
  it('names no rate of its own, and links to the page that does', () => {
    expect(SRC).not.toMatch(/\d+(\.\d+)?%/);
    expect(SRC).toContain('href="/pricing"');
    expect(SRC).toContain('See full pricing');
  });

  it('invents no proof', () => {
    expect(SRC).not.toMatch(/\b\d[\d,]*\+? (contractors|customers|users|businesses) (use|trust|have)/i);
    expect(SRC).not.toMatch(/trusted by|rated \d|testimonial/i);
    // The one invented business is labelled as invented. It used to be said
    // twice, in a note under each panel; it is said once, under both.
    expect(SRC).toContain(
      'The company, request and estimate are examples. The domain configuration shown',
    );
  });
});

/**
 * /features/back-office, restructured.
 *
 * Measured at 390x844 before: 11,443px and 1,810 words, with the page's single
 * strongest piece of evidence as the fourth section and three sections making
 * one argument in front of it.
 */
describe('the back office page', () => {
  const SRC = readFileSync('src/app/features/back-office/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('puts the job record under the hero, before the argument for it', () => {
    // Order on the PAGE, not order in the file: these are props, so the source
    // says nothing about where they render. What matters is that the record is
    // the thing in `afterProof` — the layout renders that slot above the story
    // — and not a child, which lands after the story and the benefits.
    const at = SRC.indexOf('afterProof={');
    expect(at).toBeGreaterThan(-1);
    const slot = SRC.slice(at, SRC.indexOf('cta={{', at));
    expect(slot).toContain('id="back-office-record"');
    expect(slot).toContain('<JobRecordExample />');
  });

  it('stops making the same argument three times', () => {
    // The steps section was headed with the story's own sentence and its four
    // cards were the four capability groups with the detail removed.
    expect(SRC).not.toContain('stepsTitle=');
    expect(SRC).not.toContain('steps={[');
    expect(SRC).toContain('The customer never starts over');
  });

  it('shows seventeen names and hides seventeen paragraphs', () => {
    expect(SRC).toContain('<summary>');
    expect(SRC).toContain('<p>{item.detail}</p>');
    // A <dt> may not contain a <dd>, so the pair could not hold the disclosure.
    expect(SRC).not.toContain('<dl className={styles.capList}>');
    expect(SRC).toContain('<ul className={styles.capList}>');
    // Nothing is conditionally rendered, so every explanation stays in the HTML
    // for search and for the browser's own find-in-page.
    expect(SRC).not.toMatch(/open &&|\? <p>\{item\.detail\}/);
  });

  it('gives each disclosure a row-sized target', () => {
    const CAP = readFileSync('src/app/features/back-office/back-office.module.css', 'utf8');
    expect(CAP).toMatch(/\.capList summary \{[^}]*min-height: 44px/);
  });
});

describe('the shared layout gained two optional slots', () => {
  const LAYOUT = readFileSync('src/components/marketing/feature-detail-layout.tsx', 'utf8');

  it('can place a section between the proof strip and the story', () => {
    expect(LAYOUT).toContain('afterProof?: ReactNode;');
    expect(LAYOUT).toContain('{afterProof ?? null}');
  });

  it('can drop the steps section entirely', () => {
    expect(LAYOUT).toContain('steps?: FeatureDetailCard[];');
    expect(LAYOUT).toContain('steps = []');
    expect(LAYOUT).toContain('{steps.length ? (');
  });

  it('leaves the pages that still use those sections alone', () => {
    // quick-stops dropped out of this list when its flow moved into
    // afterBenefits — four beats with icons, in place of the three the layout
    // was drawing. See the quick stops describe block below.
    for (const slug of ['ai-intake', 'client-portal', 'website-builder']) {
      expect(source(slug), slug).toContain('steps={[');
    }
  });
});

/**
 * /features/ai-intake — the product made tangible.
 *
 * The hero showed the finished brief, which is the half a visitor is least
 * able to evaluate: a brief that good invites exactly one question — how would
 * it know any of that — and a static card cannot answer it.
 */
describe('the ai intake page', () => {
  const SRC = readFileSync('src/app/features/ai-intake/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const DEMO = readFileSync('src/app/features/ai-intake/sample-intake.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('walks the request from two words to a brief', () => {
    expect(SRC).toContain('<SampleIntake>');
    expect(DEMO).toContain('What they typed');
    expect(DEMO).toContain('What it asked back');
    expect(DEMO).toContain('What you get');
    // The payoff is the page's own brief card, not a second copy of it.
    expect(SRC).toContain('<ArrivingLead />');
    expect(DEMO).toContain('{children}');
  });

  it('never autoplays and never pretends to call the model', () => {
    expect(DEMO).not.toContain('setInterval');
    expect(DEMO).not.toContain('setTimeout');
    expect(DEMO).not.toMatch(/fetch\(|<form|<input/);
    expect(SRC).toContain('nothing here calls the model');
  });

  it('tells a screen reader that the panel changed under the button', () => {
    expect(DEMO).toContain('aria-live="polite"');
  });

  it('asks for the small thing first, and asks for nothing else', () => {
    // "Build my free site" was the largest commitment on the page, in front of
    // somebody who had not yet seen the feature work. Both hero actions are
    // "look at it working" now: this page's whole argument is that the intake
    // does something a form does not, so an account is a thing to open after
    // watching it, not before. The closing CTA still takes the signup.
    expect(SRC).toContain("primary={{ label: 'Try a sample intake', href: '#sample-intake' }}");
    expect(SRC).toContain("secondary={{ label: 'See scored leads in the demo', href: '/demo/leads' }}");
    const hero = SRC.slice(SRC.indexOf('primary={{'), SRC.indexOf('demo={'));
    expect(hero).not.toContain('APP_SIGNUP_URL');
  });

  it('reassures in the heading and keeps the wit for the copy', () => {
    expect(SRC).toContain('Keep every lead. Get interrupted only by the right ones.');
    expect(SRC).not.toContain('<h2 id="intake-alerts-title">The quiet ones are the feature.</h2>');
  });

  it('compresses five benefits and six steps', () => {
    const benefits = SRC.slice(SRC.indexOf('benefits={['), SRC.indexOf('stepsTitle='));
    expect([...benefits.matchAll(/title: '/g)].length).toBe(3);
    const steps = SRC.slice(SRC.indexOf('steps={['), SRC.indexOf('cta={{'));
    expect([...steps.matchAll(/title: '/g)].length).toBe(4);
  });

  it('answers the practical questions without inventing anything', () => {
    expect([...SRC.matchAll(/^\s+q: '/gm)].length).toBe(6);
    expect(SRC).not.toMatch(/<details[^>]*name=/);
    expect(SRC).toContain('TRADES.length');
  });
});

/**
 * COPY ON A FEATURE PAGE IS COPY, NOT A CAPTION.
 *
 * Measured at 390x844: fifteen runs of real prose under 13px on /ai-intake and
 * four of them at 10. All three of the worst offenders are in the shared
 * layout, so the same numbers were on five pages.
 */
describe('the shared layout stops setting sentences at caption size', () => {
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('raises the proof strip, the benefits and the steps on a narrow screen', () => {
    const at = CSS.indexOf('.detail-proof small) { font-size: 14px');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(CSS.lastIndexOf('@media', at), at)).toContain('max-width: 900px');
    expect(CSS).toMatch(/\.detail-benefits article p\) \{ font-size: 15px/);
    expect(CSS).toMatch(/\.process-steps p\) \{ font-size: 15px/);
  });

  it('and at the widths where four columns are still narrow', () => {
    expect(CSS).toContain('(min-width: 901px) and (max-width: 1200px)');
  });
});

/**
 * /features/client-portal — shorter hero, shorter thread, honest reassurance.
 */
describe('the client portal page', () => {
  const SRC = readFileSync('src/app/features/client-portal/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('says what the homeowner does not have to do, where it can be seen', () => {
    // It was the tail of the lede. On this page it is the objection the reader
    // is most afraid of — "my customers will never use it" — so it is a proof
    // chip now, four words wide, above the fold.
    expect(SRC).toContain("title: 'No app, no password'");
    expect(SRC).toContain('not another app or password');
  });

  it('has a headline short enough to leave room for the button', () => {
    // The old one ran to four lines and 288px on a 360px phone, which put the
    // primary CTA off the first screen on its own.
    const title = SRC.slice(SRC.indexOf('title={'), SRC.indexOf('lede='));
    expect(title).toContain('Every message, <em>on the right job.</em>');
    expect(title).not.toContain('Keep every customer updated');
  });

  it('fits the eyebrow on one line', () => {
    // "Text messaging + a portal for every job" wrapped at 390px and left the
    // word JOB alone on the second line.
    expect(SRC).toContain('eyebrow="Client portals + two-way texting"');
  });

  it('offers real reassurance instead of an invented testimonial', () => {
    // There are no testimonials and none will be invented. These four are
    // checkable: the portal is a per-job link, texts are SMS with STOP, and
    // Stripe holds the card.
    const note = SRC.slice(SRC.indexOf('heroNote='), SRC.indexOf('demo={'));
    expect(note).toContain('private per-job link');
    expect(note).toContain('STOP');
    expect(note).toContain('Stripe');
    expect(note).toContain('Pay only when you get paid');
  });

  it('puts the six texture messages behind a disclosure', () => {
    // Quote sent, approved, booked, on the way, paid is the argument; eleven
    // messages on a phone was a scroll most readers did not finish.
    expect(SRC).toContain('View the complete conversation');
    expect(SRC).toContain('<details className={styles.threadMore}>');
    // Still in the HTML — nothing conditionally rendered.
    expect(SRC).not.toMatch(/showAll|\{expanded &&/);
  });

  it('compresses five benefits into three', () => {
    const benefits = SRC.slice(SRC.indexOf('benefits={['), SRC.indexOf('stepsTitle='));
    expect([...benefits.matchAll(/title: '/g)].length).toBe(3);
  });

  it('gets the hero CTA above the fold on a laptop', () => {
    // Measured at 1280x720 before: the hero's own button began at y=783, so the
    // first screen of a page whose job is to get a button pressed had none.
    // Keyed to viewport HEIGHT — that is the thing that is short.
    expect(CSS).toContain('@media (max-height: 860px) and (min-width: 901px)');
    expect(CSS).toMatch(/\.detail-hero\) \{ min-height: 0; padding-top: 118px/);
  });
});

/**
 * /features/quick-stops — one flow, one control section, and the questions.
 */
describe('the quick stops page', () => {
  const SRC = readFileSync('src/app/features/quick-stops/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('says what the money buys in the first sentence', () => {
    // "Prepaid jobs nearby" is the one thing a Quick Stop is not. The homeowner
    // buys a PRIORITY VISIT — a place in today's route and an arrival window —
    // and the work is quoted and invoiced like any other job. The old page
    // reached its fifth section before saying so, which is a refund request and
    // a chargeback waiting to happen.
    expect(SRC).toContain('Get paid to fit nearby customers into');
    expect(SRC).toContain('today’s route.');
    expect(SRC).toMatch(/Any service, labor or\s+parts are charged separately\./);
    expect(SRC).toContain('It is not payment toward the service');
  });

  it('never calls a Quick Stop a prepaid job', () => {
    // The whole failure in one word: "prepaid" says the thing you are buying is
    // the job. Banned on this page and on every surface that links to it.
    // Comments stripped first: this page's own note quotes the headline it
    // replaced, which is the sentence that has to stay findable.
    const strip = (text: string) =>
      text
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const file of [
      'src/app/features/quick-stops/page.tsx',
      'src/app/features/page.tsx',
      'src/components/flagship/flagship-home.tsx',
    ]) {
      expect(strip(readFileSync(file, 'utf8')), file).not.toMatch(/prepaid (job|work|offer)/i);
    }
  });

  it('draws the two charges rather than only asserting they are two', () => {
    // A single number on a page is read as the price of the thing on the page,
    // however many sentences around it say otherwise. The split gives the
    // second box no figure at all, because "priced separately" IS the fact.
    const card = SRC.slice(SRC.indexOf('function PendingOffer'), SRC.indexOf('const LIFECYCLE'));
    expect(card).toContain('Priority visit fee · due now');
    expect(card).toContain('Priced and charged separately');
    expect(card).not.toContain('Your fee');
    expect(SRC).toContain('The priority visit fee');
    expect(SRC).toContain('The service charge');
    // "The visit fee gets you to their door. It does not pay for the service."
    // sat immediately under the two cards, restating them in prose. The cards
    // are the distinction; a sentence repeating them is the fourth time the
    // page makes the same point.
    expect(SRC).not.toContain('It does not pay for the service.');
  });

  it('keeps the one exception the product actually has', () => {
    // /quick-stop/[id] tells the homeowner, in these words, that the fee
    // "applies as a deposit — you'd only pay the difference" on a diagnostic
    // conversion. A marketing page that flatly denied it would be contradicted
    // by our own screen.
    expect(SRC).toContain('diagnostic');
    expect(SRC).toMatch(/comes\s+off that total/);
    const CUSTOMER = readFileSync('src/app/quick-stop/[id]/page.tsx', 'utf8');
    expect(CUSTOMER).toContain('applies as a deposit');
  });

  it('counts the visit fee as revenue on top of the work, not instead of it', () => {
    // Said by the two cards and by the hero, rather than by the removed
    // arithmetic block that used to carry these phrases.
    expect(SRC).toContain('Priced separately');
    expect(SRC).toMatch(/charged separately/);
    expect(SRC).toContain('has no opinion about what you charge for the work');
  });

  it('describes the flow once, in the four beats the dashboard uses', () => {
    // It was seven, then three in the layout's own steps band. It is now the
    // same four a signed-in contractor reads on /dashboard/quick-stops — and
    // the layout's band is gone, because two flows and a six-rung lifecycle
    // ladder is one story told three times.
    expect(SRC).not.toContain('stepsTitle=');
    expect(SRC).not.toContain('steps={[');
    const flow = SRC.slice(SRC.indexOf('const FLOW = ['), SRC.indexOf('export default'));
    expect([...flow.matchAll(/title: '/g)].length).toBe(4);
    const benefits = SRC.slice(SRC.indexOf('benefits={['), SRC.indexOf('afterBenefits={'));
    expect([...benefits.matchAll(/title: '/g)].length).toBe(3);
  });

  it('carries the two facts the old three beats did not', () => {
    // The reason the four are worth the swap rather than a restyle of the three.
    expect(SRC).toContain('priority area you have drawn');
    expect(SRC).toContain('texted and emailed to you the moment it lands');
  });

  it('quotes no earnings figure at all', () => {
    /* It used to read "$150 priority visit fee … one a week for a year is
       $7,800 in visit fees alone", under three sentences insisting it was a
       multiplication rather than a projection. Every one of those sentences was
       true and none of them worked: a number that size on a page selling a
       revenue idea is read as what you will make, and the hedging is read as
       small print. It had already been demoted once — from a glowing card on
       the dashboard to the smallest type in the block — which is the tell that
       the number was the problem and not its styling. */
    expect(SRC).not.toContain('yearlyFee');
    expect(SRC).not.toContain('typicalFee');
    expect(SRC).not.toMatch(/in visit fees alone/);
    expect(SRC).not.toMatch(/7,?800/);
    expect(SRC).not.toMatch(/\b(forecast|projected|earn up to|on average|typically earn)\b/i);
    // What survives is the band, which is a fact about the product rather than
    // a claim about anybody's income, and is read from the shipped constants.
    expect(SRC).toContain('DEFAULT_QUICK_STOP_MIN_FEE_CENTS');
    expect(SRC).toContain('DEFAULT_QUICK_STOP_MAX_FEE_CENTS');
    expect(SRC).not.toMatch(/\$150\b/);
  });

  it('sends the hero button somewhere that matches its label', () => {
    // It read "See the 3-step flow" and landed on a six-rung ladder headed
    // "Two gates, and both of them are people."
    expect(SRC).not.toContain('See the 3-step flow');
    expect(SRC).toContain("label: 'See how the fee works', href: '#how-it-works'");
    expect(SRC).toContain('id="how-it-works" aria-labelledby="quick-stops-pitch-title"');
    // The ladder kept an addressable name of its own.
    expect(SRC).toContain('id="two-gates"');
  });

  it('draws the icons from the set the dashboard draws from', () => {
    const ICONS = readFileSync('src/components/quick-stop-icons.tsx', 'utf8');
    const DASH = readFileSync('src/app/dashboard/quick-stops/QuickStopExplainer.tsx', 'utf8');
    expect(SRC).toContain("from '@/components/quick-stop-icons'");
    expect(DASH).toContain("from '@/components/quick-stop-icons'");
    // No second copy of the path data anywhere.
    expect(DASH).not.toContain('const ICONS: Record<string, string>');
    expect(SRC).not.toContain('<path d=');
    for (const name of ['route', 'bell', 'tag', 'check', 'spark']) {
      expect(ICONS, name).toContain(`${name}: '<`);
    }
  });

  it('makes the denials and the limits one section about control', () => {
    // Two headings, two intros and two lists were saying the same thing at
    // different distances.
    expect(SRC).not.toContain('quick-stops-never-title');
    expect(SRC).toContain('<p className="eyebrow">You stay in control</p>');
    expect(SRC).toContain('className={styles.denial}');
  });

  it('answers the six questions off the product’s own constants', () => {
    // Six since "What exactly is the homeowner paying for?" was added — the
    // question the page previously left a visitor to answer for themselves.
    expect([...SRC.matchAll(/^\s+q: '/gm)].length).toBe(6);
    expect(SRC).toContain('DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS');
    expect(SRC).toContain('const minFee = centsToDollars(DEFAULT_QUICK_STOP_MIN_FEE_CENTS)');
    expect(SRC).not.toMatch(/<details[^>]*name=/);
  });

  it('reads the cream proof strip at a readable size and colour', () => {
    const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    // #747873 on cream at 10px was the least legible run of text on the site.
    expect(CSS).toMatch(/\.detail-proof small\) \{ font-size: 12px; color: #5f635e/);
  });
});
