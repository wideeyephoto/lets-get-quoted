// Generates src/components/flagship/flagship.module.css from the standalone
// marketing site's stylesheet.
//
//   node scripts/generate-flagship-css.mjs
//
// WHY THIS EXISTS. /home-flagship and /features-flagship reproduce a separate
// site inside this app. That site is one 98KB globals.css of unscoped, generic
// class names — .hero, .eyebrow, .portal-card, .job-row, .status-badge — and
// several of those also exist in this app's own 1MB globals.css. Pasted in as
// they are, they would restyle the live site. So every rule is emitted as
// `.root :global(<selector>)`: the markup keeps its original class names and
// nothing can escape the two routes.
//
// The output is generated, so do not hand-edit it. Deliberate departures from
// the source design go in TWEAKS at the bottom of this file, which is appended
// last and therefore wins on source order.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'C:/Users/brett/Documents/Codex/2026-08-06/what-should-i-include-in-my/app/globals.css';
const OUT = 'src/components/flagship/flagship.module.css';

let css = readFileSync(SRC, 'utf8');

// Tailwind v4 supplied this sheet's reset; this app has no Tailwind. Dropped
// here and replaced explicitly in PREFLIGHT below.
css = css.replace(/@import\s+["']tailwindcss["']\s*;?/g, '');
css = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split a block body into top-level statements, respecting nesting and strings. */
function statements(body) {
  const out = [];
  let depth = 0;
  let buf = '';
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      buf += c;
      if (c === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') depth--;
    buf += c;
    if (depth === 0 && (c === '}' || c === ';')) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

const PSEUDO_ELEMENTS =
  /(::?(?:before|after|placeholder|selection|first-line|first-letter|marker|backdrop))+$/;

function scopeSelector(sel) {
  sel = sel.trim();
  if (!sel) return sel;
  if (sel === ':root' || sel === 'html' || sel === 'body' || sel === 'html body') return '.root';
  if (sel === '*') return '.root, .root *';
  if (sel === '*, *::before, *::after')
    return '.root, .root *, .root *::before, .root *::after';
  if (sel.startsWith(':') && !sel.startsWith('::')) return `.root :global(*${sel})`;

  // Pseudo-ELEMENTS must sit outside :global(...). `:global(.x::before)` is
  // invalid, and the $0 dial rings, the hero glow and the pipeline orbit are
  // all drawn with them.
  const pe = sel.match(PSEUDO_ELEMENTS);
  if (pe) {
    const base = sel.slice(0, sel.length - pe[0].length);
    return base ? `.root :global(${base})${pe[0]}` : `.root ${pe[0]}`;
  }
  if (/^(html|body)\s+/.test(sel)) return `.root :global(${sel.replace(/^(html|body)\s+/, '')})`;
  return `.root :global(${sel})`;
}

const scopeSelectorList = (list) => list.split(',').map(scopeSelector).filter(Boolean).join(',\n');

const keyframes = new Set();

function transform(block) {
  return statements(block)
    .map((stmt) => {
      if (!stmt.includes('{')) return stmt;
      const open = stmt.indexOf('{');
      const prelude = stmt.slice(0, open).trim();
      const body = stmt.slice(open + 1, stmt.lastIndexOf('}'));

      if (prelude.startsWith('@keyframes')) {
        const name = prelude.replace('@keyframes', '').trim();
        keyframes.add(name);
        // LOCAL on purpose. `@keyframes :global(name)` is rejected by
        // css-loader's pure mode, and a local name is safer anyway: it is
        // hashed, every animation reference in this file is rewritten to
        // match, and it cannot collide with a keyframe in globals.css.
        return `@keyframes ${name} {${body}}`;
      }
      if (/^@(media|supports|container|layer)/.test(prelude)) {
        return `${prelude} {\n${transform(body)}\n}`;
      }
      if (prelude.startsWith('@')) return stmt;
      return `${scopeSelectorList(prelude)} {${body}}`;
    })
    .join('\n\n');
}

const scoped = transform(css);

const PREFLIGHT = `
/* ---------------------------------------------------------------------------
   Tailwind preflight, re-declared.

   The source sheet leaned on it. Without a replacement, this app's own element
   rules apply inside the scope — globals.css sets \`h1 { max-width: 11ch }\`,
   which alone collapses every hero headline into a narrow tower.
   --------------------------------------------------------------------------- */
.root h1, .root h2, .root h3, .root h4, .root h5, .root h6 {
  margin: 0; max-width: none; font-size: inherit; font-weight: inherit;
  line-height: inherit; letter-spacing: normal; font-family: inherit; color: inherit;
}
.root p, .root figure, .root blockquote, .root dl, .root dd { margin: 0; }
.root ul, .root ol { margin: 0; padding: 0; list-style: none; }
.root button, .root input, .root select, .root textarea { font: inherit; color: inherit; margin: 0; }
.root button { background: none; border: 0; padding: 0; cursor: pointer; text-align: inherit; }
.root img, .root svg, .root video, .root canvas { display: block; max-width: 100%; height: auto; }
.root a { color: inherit; text-decoration: none; }
.root small { font-size: inherit; }
.root b, .root strong { font-weight: inherit; }
.root i, .root em { font-style: normal; }
.root table { border-collapse: collapse; }
`;

const TWEAKS = `
/* ===========================================================================
   TWEAKS — deliberate departures from the source design.

   Appended last, so these win on source order against the generated rules
   above at equal specificity. Everything here is a considered change, not a
   port artefact. Add to this block rather than editing the output.
   =========================================================================== */

/* ---- a font the source assumed and this app does not have ------------------

   The source sheet reaches for \`--font-geist-mono\` in ten places — every
   kicker, pill, meter and code-ish label on both flagship routes. That site
   loaded Geist Mono in its own layout; this app loads JetBrains Mono as
   --font-mono and defines nothing by the Geist name, so all ten declarations
   were invalid at computed-value time and quietly inherited the body font.
   Every one of those elements has been rendering in the wrong typeface since
   the route was built.

   Aliased rather than find-and-replaced, so the generated rules above stay a
   faithful copy of the source and the mapping lives in one place.

   --font-geist-sans needs no alias: GeistSans.variable really is on <body>. */
.root {
  --font-geist-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ---- the H1's tracking -----------------------------------------------------

   The source sets \`letter-spacing: -5px\` on a \`clamp(52px, 5.4vw, 88px)\`
   headline, and -3px on the 51px mobile one. Tracking in px against a fluid
   font-size does not scale: -5px is -0.057em at 88px but -0.096em at 52px, so
   the headline got TIGHTER as it got smaller, which is backwards — small type
   needs more room between letters, not less.

   One em value fixes both the requested loosening and that inversion, and it
   overrides the mobile rule too (same specificity, later in the file) while
   leaving its font-size alone. */
.root :global(.hero h1) {
  letter-spacing: -0.025em;
}

/* ---- the pipeline, put into space -----------------------------------------

   The source's Product page renders .system-pipeline as a flat strip. The
   homepage's .dashboard-card is the same site's answer to "make this look
   photographed rather than drawn": a perspective container, a small two-axis
   tilt, and a shadow stack under it. This borrows that treatment for the
   pipeline without borrowing .dashboard-card itself, which is
   position:absolute at a fixed 500px height tuned to .hero-product's box and
   fights everything when reused.

   The tilt is EXACTLY rotateY(-4deg) rotateX(1deg). It has to be: the
   dashboardFloat keyframe restates the whole transform at its 50% frame rather
   than animating translateY alone, so any other angle snaps to the homepage's
   twice per eight-second cycle. */
.root :global(.system-stage) {
  position: relative;
  width: 100%;
  max-width: 1180px;
  margin: 46px auto 0;
  perspective: 1400px;
}

.root :global(.system-stage .system-pipeline) {
  margin-top: 0;
  transform: rotateY(-4deg) rotateX(1deg);
  box-shadow:
    0 2px 0 rgba(255, 255, 255, 0.05) inset,
    0 28px 42px rgba(0, 0, 0, 0.26),
    0 65px 130px rgba(0, 0, 0, 0.46),
    -25px 18px 80px rgba(20, 88, 110, 0.12);
  animation: dashboardFloat 8s ease-in-out infinite;
}

/* The two interruptions, over the panel on a desktop. Positioned against the
   stage rather than the pipeline, because the pipeline is the tilted element
   and children of it would inherit the rotation and read as skewed labels. */
.root :global(.system-stage .floating-alert) {
  position: absolute;
  top: 8px;
  right: -18px;
  z-index: 4;
}
.root :global(.system-stage .floating-paid) {
  bottom: 42px;
  left: -20px;
  z-index: 4;
}

/* Truthfulness marker. Every mock in this cluster says it is a mock; the ported
   sheet has no class for that because the source site never labelled one. */
.root :global(.example-mark) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 18px auto 0;
  padding: 5px 11px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  font-family: var(--font-geist-mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8fa3b0;
}
.root :global(.example-mark) b {
  font-weight: 700;
  color: var(--orange);
}

@media (max-width: 1000px) {
  /* Below this the notifications have nowhere to sit that is not on top of the
     copy, so they rejoin the flow underneath. */
  .root :global(.system-stage .floating-alert),
  .root :global(.system-stage .floating-paid) {
    position: static;
    width: 100%;
    margin-top: 10px;
  }
  .root :global(.system-stage .system-pipeline) {
    transform: none;
    animation: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* The tilt is composition and stays; the drift is decoration and goes. */
  .root :global(.system-stage .system-pipeline) { animation: none; }
}

/* ---- two things the detail pages need and the source never had -------------

   The source's detail template has no back-link out of a child page and no
   reassurance line under the hero buttons. Ours carry both — a visitor deep in
   /features/quick-stops should be one click from the index, and each page
   answers its own "what does this cost me" question under the buttons rather
   than in a band 2,000px further down. Styled to match .eyebrow and the hero
   copy around them. */
.root :global(.detail-back) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 22px;
  font-family: var(--font-geist-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fa3b0;
  transition: color 0.2s ease;
}
.root :global(.detail-back:hover) {
  color: var(--orange);
}

.root :global(.detail-hero-note) {
  margin-top: 18px;
  max-width: 54ch;
  font-size: 13px;
  line-height: 1.55;
  color: #8fa3b0;
}

/* ---- the pipeline, made readable ------------------------------------------

   The source set this readout at 6-7px. Not small-as-a-style — 6px is around
   half the smallest size most people can read comfortably, and the state chip
   ("✓ CAPTURED", "IN PROGRESS") was 6px of #6e8996 on a near-black card, which
   is the least legible text on either flagship page. It is also the text
   carrying the whole argument of the panel: which stage the job is on.

   Three changes together, because any one alone does not fix it:

     TYPEFACE. The labels, states and stage numbers move to the mono face. At
     this size a heavy grotesque with 1px of tracking turns to mush, while mono
     keeps its counters open and reads as an instrument panel — which is what a
     live job readout should look like. The VALUE line moves the other way, to
     the display face, so the two are told apart by shape as well as by size.

     SCALE. Roughly doubled: 6-7px to 10-11px, and the value from 11px to 15px.
     The cards are ~215px wide in the five-column grid, so there is room.

     CONTRAST. The head and the upcoming-state chip were dim grey on near
     black. Both lifted; the mint and orange states already carried enough.

   The rest of the panel — the geometry, the borders, the mint/orange state
   colours — is untouched. */
.root :global(.system-pipeline-head) {
  font-family: var(--font-geist-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #9fb4c0;
}

.root :global(.system-pipeline-track article) {
  min-height: 150px;
}

/* The stage number. Bigger circle to match the bigger numeral. */
.root :global(.system-pipeline-track article) > span {
  width: 34px;
  height: 34px;
  margin-bottom: 16px;
  font-family: var(--font-geist-mono);
  font-size: 11px;
  font-weight: 600;
}

/* WEBSITE / INTAKE / QUOTE / SCHEDULE / PAYMENT. */
.root :global(.system-pipeline-track article) > small {
  font-family: var(--font-geist-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

/* The value — the line a visitor actually reads. Display face, and the only
   thing on the card set large enough to scan from a distance. */
.root :global(.system-pipeline-track article) > b {
  margin-top: 9px;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: #f4f8fa;
}

/* The state chip: was the worst offender at 6px. */
.root :global(.system-pipeline-track article) > em {
  padding-top: 14px;
  font-family: var(--font-geist-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #93a9b6;
}

/* The record strip under the track, same treatment. */
.root :global(.system-job-record) span {
  font-family: var(--font-geist-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
}
.root :global(.system-job-record) b {
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  font-size: 14px;
  font-weight: 650;
}
.root :global(.system-job-record) small {
  font-size: 11px;
  color: #a3b6c1;
}

@media (max-width: 760px) {
  /* Two-up on a phone means wider cards, so nothing needs to shrink back —
     only the head, which has two items competing for one line. */
  .root :global(.system-pipeline-head) { font-size: 9.5px; }
  .root :global(.system-pipeline-track article) { min-height: 132px; }
}

/* ---- the four promises -----------------------------------------------------

   They were two lines of small grey text in four boxes: a 10px label over an
   11px description, both in low-contrast grey on cream, with all the visual
   interest in a hover state that a phone never sees.

   Three changes, no markup:
     - The description becomes the readable line — larger and properly dark —
       since "One-click AI builder" is the actual information and the label
       above it is only a category.
     - The label takes the brand orange, which is what makes the strip read as
       part of the page rather than a footnote pasted under it.
     - A counter numbers them 01–04. The page already counts its features and
       its pipeline stages, so the strip joins that language instead of sitting
       outside it, and the numbers give the row a rhythm at a glance.

   The persistent left rule is what the hover state used to be the only hint
   of: visible at rest, filling on hover, so the affordance survives on touch. */
.root :global(.trust-strip) {
  counter-reset: lgq-promise;
}

.root :global(.trust-strip span) {
  counter-increment: lgq-promise;
  padding-left: 30px;
  font-size: 12.5px;
  line-height: 1.45;
  color: #3f4b52;
}

/* The number, quiet in the corner. Monospace so the four line up. */
.root :global(.trust-strip span)::after {
  content: counter(lgq-promise, decimal-leading-zero);
  position: absolute;
  top: 12px;
  right: 16px;
  font-family: var(--font-geist-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: rgba(255, 106, 36, 0.55);
}

.root :global(.trust-strip b) {
  font-size: 9.5px;
  letter-spacing: 1.4px;
  color: var(--orange);
  margin-bottom: 6px;
}

/* The source used ::before as a top bar that only existed on hover. Re-aimed
   as a left rule that is always there and fills on hover — a strip of four
   promises should look deliberate before anyone touches it. */
.root :global(.trust-strip span)::before {
  left: 0;
  top: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    var(--orange) 0%,
    rgba(255, 106, 36, 0.28) 100%
  );
  opacity: 0.5;
  transition: opacity 0.25s ease;
}

.root :global(.trust-strip span:hover)::before {
  width: 3px;
  opacity: 1;
}

@media (max-width: 760px) {
  /* Two up on a phone; the corner number would crowd the label at that width. */
  .root :global(.trust-strip span) { padding-left: 22px; font-size: 12px; }
  .root :global(.trust-strip span)::after { display: none; }
}

/* NOTE — no tonal-break tweak here, deliberately.

   A first pass added one, on a measurement that said this page had a single
   120px light band in 8,800px. That measurement was wrong: it sampled one x
   position near the right edge, and across .included and .difference that
   point lands on a dark card sitting ON the cream rather than on the cream.
   Both of those sections have been light since the source — see the
   backgrounds around lines 496 and 516, and the richer gradients that
   override them later.

   The tweak that "added" the break therefore added nothing, and cost
   something: a flat \`var(--cream)\` replaced a two-stop gradient, and a flat
   white card face replaced one with an inset highlight, a shadow and an
   accent bar. Left out. When a page already does the thing, the fix is to
   measure better, not to restate it more loudly. */

/* ---- the sticky phone bar, while the hero's own button is on screen --------

   SiteFooter renders a fixed "Build my free site" bar for phones and the
   flagship hero renders a "Build my free site" button, so the first thing a
   contractor saw on a phone was that button twice, one directly above the
   other. The bar earns its place further down, where there is nothing else to
   press. /home-flagship sets data-hero-cta on its root; the other flagship
   routes never set it, so their bar is untouched. */
.root[data-hero-cta='visible'] :global(.mobile-cta) { display: none; }

/* ---- the feature tour's sticky visual, which was not sticking ---------------

   MEASURED: through the whole .flagships section the product panel moved 1:1
   with the page — top: 709px, then 164, then -381, then -926 and gone. So for
   the last two of the three features the right-hand half of the viewport was
   simply empty, which is most of a 2,700px section and about a quarter of the
   homepage.

   The cause is one word in the section above it. \`.flagships\` sets
   \`overflow: hidden\` (for the grid overlay in ::before and the two radial
   glows), and an ancestor with overflow other than visible becomes the
   scrolling box that a sticky descendant sticks WITHIN. .flagships never
   scrolls, so nothing ever stuck.

   \`clip\` clips exactly the same way and does NOT establish a scroll container,
   which is the whole reason it exists. One word, and the tour works.

   The offset is the second half of it. \`top: 0\` pinned the panel under the
   82px fixed header rather than below it, which is also why the step headings
   were sliced in half as they came up — so the pin, the panel height and the
   scroll target all move down by the header. */
.root :global(.flagships) { overflow: clip; }
/* SCOPED, because TWEAKS is appended last and an unconditional rule here beats
   a media query earlier in the file. Below 1100px the source sheet sets
   position:static and height:auto to un-stick this panel — and this rule,
   setting only top and height, left it static with a hard height of
   100vh minus 82px. On an iPhone that is also the classic 100vh trap: the value
   is the LARGE viewport, so the panel was taller than the screen it was sized
   for. Neither was visible on a desktop, which is where it was checked. */
@media (min-width: 1101px) {
  .root :global(.sticky-product) {
    top: 82px;
    height: calc(100vh - 82px);
  }
}
/* goToStep() scrolls a step to centre; without this the browser can still park
   one under the fixed header when the step is taller than the viewport. */
.root :global(.feature-step) { scroll-margin-top: 100px; }

/* ---- the example marker inside that sticky column --------------------------

   .sticky-product is \`display: flex\`, and its other two children — the step
   wheel and the scroll prompt — are both absolutely positioned. The marker was
   not, so it became the one in-flow flex ITEM beside .visual-stage: it sat to
   the RIGHT of the product panel like a stray caption, and the width it took
   squeezed the stage enough to push the wheel onto the phone mock.

   Out of flow, bottom-left, opposite the scroll prompt.

   ONE LINE, and max-width is exactly what it must not have. .example-mark is
   display:inline-flex, so <b>Example</b> and the sentence after it are two
   separate flex items: a max-width wraps the sentence to three lines inside its
   own box while align-items:center parks "EXAMPLE" against the middle of it.
   Rendered, that read "— AN INVENTED / EXAMPLE BUSINESS, NOT A REAL /
   CUSTOMER." — the same trap as the hero's marker, from the fix for a different
   problem. Smaller type instead, so one line still clears the scroll prompt in
   the 451px panel at 1101px. */
.root :global(.sticky-product .example-mark) {
  position: absolute;
  left: 0;
  bottom: 4vh;
  margin: 0;
  max-width: none;
  white-space: nowrap;
  font-size: 8.5px;
  letter-spacing: 0.09em;
}

/* The three §-blocks that placed the step WHEEL used to live here — a gutter
   offset above 1101px and a top-right corner between 761 and 1100. The wheel is
   a vertical stepper now (§103), so they could not match anything and are gone
   rather than left to read as live rules. The base sheet's own .wheel-* rules
   stay: they are a faithful copy of the source site, which this file is
   generated from. */

/* ---- the dimmed steps in that tour -----------------------------------------

   opacity .25 against #07131d leaves body copy under 2:1 — not "de-emphasised"
   but unreadable, and the FIRST thing anyone sees of that section is a step in
   exactly that state. The dimming is the mechanism and it stays; it just stops
   short of illegible.

   Also a floor for reduced-motion users, who never get the transition that
   would have brought a step up to full strength. */
.root :global(.feature-step) { opacity: .46; }
@media (prefers-reduced-motion: reduce) {
  .root :global(.feature-step) { opacity: 1; transform: none; transition: none; }
}

/* ---- text on the orange closing band ---------------------------------------

   MEASURED from painted pixels: the supporting line under the closing headline
   ran at 1.16:1 and the reassurance under the button at 3.35:1. The last thing
   the page says before its one white button was, in practice, invisible.

   White cannot fix it. #ff6a24 has a relative luminance of about 0.317, so
   pure white against it is roughly 2.9:1 — under AA for normal text and under
   even the 3:1 large-text floor. On a saturated brand colour the readable
   direction is down, not up, which is what the eyebrow already does at
   #582006. These take the same route and go a little further, because #582006
   itself only just clears 4.5.

   The headline stays white: at 52–104px it is large text, and 2.9:1 against a
   3:1 requirement on a display size that dominates the band is the one place
   the brand look is worth the trade. */
.root :global(.final-cta > p:not(.eyebrow)),
.root :global(.final-cta > small),
.root :global(.final-cta .eyebrow) {
  color: #4a1704;
}
/* The mark inside the eyebrow stays white — it is a glyph, not a word. */
.root :global(.final-cta .eyebrow span) { color: #ffffff; }

/* ---- muted text that met a light background --------------------------------

   \`--muted\` is a dark-theme value, and three places apply it on cream: the
   intro paragraph beside "One system from quote to review" (1.92:1) and both
   columns of the stack comparison (1.92–2.03:1).

   The patchwork column is MEANT to read as the weaker option, and it still
   does — but a comparison only works if both sides can be read, and "CRM +
   scheduling" at 1.92:1 is not weak, it is gone. */
.root :global(.included-head > p:last-child) { color: #5f635e; }
.root :global(.stack-card.patchwork) { color: #4b4f4a; }
.root :global(.stack-card.patchwork li) { color: #4b4f4a; }
/* 8px uppercase: at that size the hierarchy nuance is worth less than
   being legible, so it takes the same value as the body text around it. */
.root :global(.stack-card.patchwork li b) { color: #5f635e; }
.root :global(.stack-card.patchwork > p) { color: #5f635e; }
.root :global(.stack-card.patchwork .stack-label small) { color: #5f635e; }

/* ---- the hero dashboard mock, at a readable size ---------------------------

   The panel is 669px wide and its labels were set at 8px, its captions at 9px
   and its rows at 11px — roughly 0.7x the size the same layout would use if it
   were the real dashboard. A screenshot can get away with that; this is live
   text at 1x, and "NEEDS YOUR ATTENTION" at 8px is texture, not a word.

   The mock is the page's main evidence that the product exists, so it should
   be readable rather than merely suggestive.

   The card had NO vertical slack — 498px of content in a 498px box, with
   overflow hidden — so every size here is paired with room to put it in. The
   height below is measured, not guessed: see the check that the card's
   scrollHeight still fits its clientHeight. */
.root :global(.hero-product) { height: 726px; }
.root :global(.dashboard-card) { height: 566px; }

.root :global(.dash-top) { height: 58px; font-size: 13px; }
.root :global(.dash-top i) { width: 30px; height: 30px; font-size: 11px; }
.root :global(.dash-body) { height: calc(100% - 58px); }

.root :global(.dash-greeting small),
.root :global(.attention-card > small),
.root :global(.dash-grid small) { font-size: 11px; letter-spacing: 1.1px; }
.root :global(.dash-greeting h2) { font-size: 25px; }
.root :global(.dash-greeting button) { font-size: 12px; padding: 10px 16px; }

.root :global(.attention-row) { font-size: 12.5px; }
.root :global(.attention-row b) { font-size: 18px; }

.root :global(.dash-grid p) { font-size: 11px; }
.root :global(.dash-grid strong) { font-size: 22px; }
.root :global(.dash-grid > div) { min-height: 118px; }

/* The two floating badges sit against the card, so they move with it. */
.root :global(.floating-alert small),
.root :global(.floating-paid small) { font-size: 10px; }
.root :global(.floating-alert b),
.root :global(.floating-paid b) { font-size: 13px; }

/* The hero's example marker, same trap as the tour's.
   .hero-product's other three children — the card and both floating badges —
   are all absolutely positioned, so the marker was the only thing in normal
   flow and rendered at the TOP of the box, across the AI-alert badge. Pinned
   below the card instead, on the right so it clears the payment badge in the
   bottom-left corner. */
.root :global(.hero-product .example-mark) {
  position: absolute;
  right: 0;
  bottom: 0;
  margin: 0;
  /* One line. It is an inline-flex pill of three items, so a max-width made
     the three wrap independently and right-aligning them produced a ragged
     block with "See the live demo" broken across two of the lines. */
  white-space: nowrap;
}
/* On a phone one line is wider than the screen, so it rejoins the flow under
   the panel and is allowed to wrap — the same place the floating badges go. */
@media (max-width: 760px) {
  .root :global(.hero-product .example-mark) {
    position: static;
    white-space: normal;
    margin: 14px auto 0;
  }
}

/* ---- the homepage FAQ ------------------------------------------------------

   New to this page, and not a port: the source tour had no FAQ. It is here
   because the site's FAQPage structured data has to describe content a visitor
   can actually see, and the seven questions moved across with the homepage.

   Cream, between the dark pricing band and the dark closing CTA, so the page
   keeps alternating rather than running dark from pricing to footer. */
.root :global(.home-faq) {
  padding: 110px clamp(24px, 6vw, 100px);
  background:
    radial-gradient(circle at 12% 8%, rgba(255, 106, 36, 0.09), transparent 26%),
    linear-gradient(150deg, #fffdf9, #efe9df);
  color: var(--ink);
  border-top: 1px solid #ded7cc;
}
.root :global(.home-faq-head) { max-width: 780px; margin: 0 auto 44px; text-align: center; }
.root :global(.home-faq-head h2) {
  margin: 14px 0 0;
  font-size: clamp(30px, 3.6vw, 46px);
  letter-spacing: -0.03em;
  line-height: 1.06;
  color: var(--ink);
}
.root :global(.home-faq-head .eyebrow) { justify-content: center; color: var(--orange); }
.root :global(.home-faq-list) { max-width: 860px; margin: 0 auto; display: grid; gap: 12px; }
.root :global(.home-faq-list details) {
  border: 1px solid rgba(164, 153, 137, 0.5);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(247, 242, 233, 0.66));
  box-shadow: 0 2px 0 rgba(255, 255, 255, 0.9) inset;
  overflow: hidden;
}
.root :global(.home-faq-list summary) {
  padding: 20px 54px 20px 22px;
  position: relative;
  cursor: pointer;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
  list-style: none;
}
.root :global(.home-faq-list summary)::-webkit-details-marker { display: none; }
/* A rotating chevron rather than the UA triangle, which sits at a different
   place in every browser and cannot be coloured. */
.root :global(.home-faq-list summary)::after {
  content: "";
  position: absolute;
  right: 24px;
  top: 50%;
  width: 9px;
  height: 9px;
  border-right: 2px solid var(--orange);
  border-bottom: 2px solid var(--orange);
  transform: translateY(-70%) rotate(45deg);
  transition: transform 0.18s ease;
}
.root :global(.home-faq-list details[open] summary)::after { transform: translateY(-30%) rotate(-135deg); }
.root :global(.home-faq-list summary:hover) { color: var(--orange); }
.root :global(.home-faq-list summary:focus-visible) {
  outline: 2px solid var(--orange);
  outline-offset: -3px;
}
.root :global(.home-faq-list details p) {
  margin: 0;
  padding: 0 54px 22px 22px;
  font-size: 15px;
  line-height: 1.65;
  color: #5f635e;
}
@media (max-width: 760px) {
  .root :global(.home-faq) { padding: 76px 20px; }
  .root :global(.home-faq-list summary) { font-size: 15.5px; padding-right: 46px; }
  .root :global(.home-faq-list details p) { padding-right: 22px; font-size: 14.5px; }
}

/* ---- something to press at the price ---------------------------------------

   The pricing band is where the decision gets made and it had no button in it.
   Centred with the rest of that column, and given room from the fine print. */
.root :global(.pricing-copy .button.primary) {
  margin-top: 22px;
  align-self: start;
}

/* ===========================================================================
   §00 — THE MOTION SYSTEM

   Three declared planes and one reveal, applied page-wide. The rates live in
   flagship-home.tsx (PLANES); this is only what they paint.

   data-motion="on" is set by the motion effect after mount, and never when the
   visitor has asked for reduced motion. EVERY rule that would leave content
   hidden, untilted or half-wiped without JavaScript is gated behind it — the
   pre-JS render and the reduced-motion render both show the page fully
   composed. Get this wrong and the failure is invisible in development and
   total in production.
   =========================================================================== */

.root :global([data-plane]) {
  transform: translate3d(0, var(--plane-y, 0px), 0);
  will-change: transform;
}

.root[data-motion="on"] :global([data-rise]) {
  opacity: 0;
  transform: translate3d(0, 26px, 0);
  transition:
    opacity .8s cubic-bezier(.2, .7, .3, 1),
    transform .8s cubic-bezier(.2, .7, .3, 1);
  transition-delay: calc(var(--rise-i, 0) * 75ms);
}
.root[data-motion="on"] :global([data-rise].is-in) {
  opacity: 1;
  transform: none;
}

/* Two grids get both a reveal and a lift-on-hover, and the reveal's resting
   \`transform: none\` outranks the hover rule it was written before. Restated
   here at a specificity that wins, or the cards stop lifting once revealed. */
.root[data-motion="on"] :global(.suite-grid article[data-rise].is-in:hover) { transform: translateY(-7px); }
.root[data-motion="on"] :global(.ai-rail article[data-rise].is-in:hover) { transform: translateY(-4px); }

/* ===========================================================================
   §01 — THE HERO

   Copy left, product right, four pillars along the bottom of the copy.

   The rising console that used to live here — a drawn dashboard that tilted
   back on arrival and levelled as you scrolled — is gone, and so are its ~250
   lines. What replaced it is four real screenshots of the running app, so
   there is nothing left to draw, tilt or keep in sync with the product.
   =========================================================================== */

.root :global(.hero-split) {
  display: grid;
  grid-template-columns: minmax(0, .84fr) minmax(0, 1.16fr);
  gap: clamp(36px, 5vw, 84px);
  align-items: center;
  padding: clamp(48px, 6vw, 96px) clamp(20px, 5vw, 86px) clamp(56px, 7vw, 104px);
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 6% 2%, rgba(124, 92, 255, .16), transparent 38%),
    radial-gradient(circle at 92% 86%, rgba(255, 106, 36, .10), transparent 34%),
    linear-gradient(165deg, #0a1017, #0b1a24 62%, #0a1720);
}

.root :global(.hero-split .hero-copy) {
  max-width: 620px;
  padding: 0; background: none; border: 0; border-radius: 0;
}
.root :global(.hero-split h1) {
  margin: 0;
  font-size: clamp(40px, 4.6vw, 68px);
  line-height: 1.02;
  letter-spacing: -.035em;
  text-wrap: balance;
}
.root :global(.hero-split h1 em) { color: var(--orange); font-style: normal; display: block; }
.root :global(.hero-split .hero-sub) {
  margin: 22px 0 0;
  max-width: 46ch;
  font-size: clamp(16px, 1.35vw, 19px);
  line-height: 1.62;
  color: #a9bac4;
}
.root :global(.hero-split .hero-actions) { margin-top: 32px; justify-content: flex-start; }
.root :global(.hero-split .hero-note) { margin-top: 18px; }

/* ---- the four pillars ---------------------------------------------------- */

.root :global(.hero-pillars) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: clamp(34px, 4vw, 54px) 0 0;
  padding-top: clamp(26px, 3vw, 38px);
  border-top: 1px solid rgba(174, 199, 211, .13);
}
/* margin:0 is the load-bearing one. globals.css carries an "li + li" rule worth
   7.2px, so the first pillar sat 7px above the other three at every width —
   nothing to do with alignment, which is what it looked like. PREFLIGHT resets
   ul and ol margins inside .root but not the list items' own. */
.root :global(.hero-pillars li) {
  display: grid;
  margin: 0;
  align-self: start;
  justify-items: start;
  align-content: start;
  gap: 11px;
}
.root :global(.pillar-icon) {
  display: grid; place-items: center;
  width: 46px; height: 46px;
  border-radius: 13px;
  border: 1px solid var(--tone-line);
  background: var(--tone-fill);
  color: var(--tone);
}
.root :global(.pillar-icon svg) { width: 21px; height: 21px; }
.root :global(.hero-pillars b) {
  font-size: 13px; font-weight: 650; line-height: 1.35;
  color: #cfdbe2;
  text-wrap: balance;
}

/* Category colours, not status. One custom property per tone so the icon rule
   above stays a single rule. */
.root :global(.hero-pillars li[data-tone="violet"]) { --tone: #a394ff; --tone-fill: rgba(124, 92, 255, .13); --tone-line: rgba(124, 92, 255, .34); }
.root :global(.hero-pillars li[data-tone="orange"]) { --tone: #ff9257; --tone-fill: rgba(255, 106, 36, .13); --tone-line: rgba(255, 106, 36, .36); }
.root :global(.hero-pillars li[data-tone="green"])  { --tone: #5ed6a0; --tone-fill: rgba(53, 201, 138, .13); --tone-line: rgba(53, 201, 138, .34); }
.root :global(.hero-pillars li[data-tone="blue"])   { --tone: #6fb4f5; --tone-fill: rgba(77, 157, 240, .13); --tone-line: rgba(77, 157, 240, .34); }

/* ---- the product slider -------------------------------------------------- */

/* The old .hero-product was a 660-726px box with a 1200px perspective, sized
   to hold a drawn console that no longer exists — and its .example-mark was
   absolutely positioned to the bottom-right corner of that box, which stranded
   the marker a screen away from the thing it labels. Both undone here. */
.root :global(.hero-split .hero-product) {
  position: relative;
  width: 100%;
  height: auto;
  perspective: none;
  text-align: left;
}
.root :global(.hero-showcase) { position: relative; }

/* The frame is sized by aspect ratio rather than by the image, so swapping a
   screenshot for one a few pixels different cannot shift the whole hero. */
.root :global(.showcase-frame) {
  position: relative;
  aspect-ratio: 1600 / 1000;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(174, 199, 211, .18);
  background: #0a1017;
  box-shadow:
    0 40px 90px -30px rgba(0, 0, 0, .7),
    0 0 0 1px rgba(255, 255, 255, .03) inset;
}
.root :global(.showcase-shot) {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: top left;
  opacity: 0;
  transition: opacity .55s ease;
}
.root :global(.showcase-shot[data-on="true"]) { opacity: 1; }

/* ---- the tabs ------------------------------------------------------------ */

.root :global(.showcase-tabs) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.root :global(.showcase-tabs button) {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px 9px 11px;
  border-radius: 999px;
  border: 1px solid rgba(174, 199, 211, .17);
  background: rgba(255, 255, 255, .03);
  color: #9db0bd;
  font-size: 12.5px; font-weight: 600;
  transition: color .2s ease, border-color .2s ease, background .2s ease;
}
.root :global(.showcase-tabs button:hover) { color: #e6eef2; border-color: rgba(255, 106, 36, .4); }
.root :global(.showcase-tabs button[data-on="true"]) {
  color: #f3f7f8;
  border-color: rgba(255, 106, 36, .5);
  background: rgba(255, 106, 36, .09);
}

/* The dot doubles as the dwell timer, so the rotation is legible rather than
   something that just happens to you. */
.root :global(.showcase-tabs i) {
  position: relative;
  display: block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: rgba(174, 199, 211, .3);
  overflow: hidden;
}
.root :global(.showcase-tabs button[data-on="true"] i) { background: rgba(255, 106, 36, .3); }
.root :global(.showcase-tabs button[data-on="true"] i s) {
  position: absolute; inset: 0;
  border-radius: 50%;
  background: var(--orange);
  transform: scale(0);
  animation-name: showcaseDwell;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes showcaseDwell { from { transform: scale(0); } to { transform: scale(1); } }

/* Paused on hover, and never animated for a visitor who asked for less motion —
   in both cases the dot is simply filled, because a half-filled timer that is
   not counting is a lie about what is about to happen. */
.root :global(.hero-showcase:hover .showcase-tabs button[data-on="true"] i s) { animation: none; transform: scale(1); }
@media (prefers-reduced-motion: reduce) {
  .root :global(.showcase-shot) { transition: none; }
  .root :global(.showcase-tabs button[data-on="true"] i s) { animation: none; transform: scale(1); }
}

.root :global(.hero-split .hero-product .example-mark) {
  position: static;
  display: flex;
  width: max-content;
  max-width: 100%;
  margin: 12px 0 0;
  white-space: normal;
}

/* ---- narrower ------------------------------------------------------------ */

@media (max-width: 1100px) {
  .root :global(.hero-split) { grid-template-columns: minmax(0, 1fr); gap: 40px; }
  .root :global(.hero-split .hero-copy) { max-width: 720px; }
}
@media (max-width: 760px) {
  .root :global(.hero-pillars) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 14px; }
  .root :global(.hero-split .hero-actions) { display: grid; }
  .root :global(.hero-split .hero-actions .button) { justify-content: center; }
  .root :global(.showcase-tabs) { gap: 6px; }
  .root :global(.showcase-tabs button) { padding: 8px 11px 8px 9px; font-size: 11.5px; }

  /* A 1600px desktop screen shown 350px wide is a 4.6x reduction — a picture of
     a dashboard with nothing on it you can read, which is the thing worth
     avoiding rather than the thing worth doing. The frame goes portrait and
     crops INTO the screen instead: the same asset at about 2x, showing an
     800px-wide window of it.

     WHICH 800px is per screen, and comes from the component — hero-showcase.tsx
     sets object-position inline off each shot's own "focus". One shared value
     cannot work: the app sidebar is ~270px wide but the website builder's
     control panel is ~600px, so the offset that clears one lands in the middle
     of the other and cuts every label mid-word. The rule below is only the
     fallback for a shot that arrives without a focus.

     It has no effect above this breakpoint: the frame is 1600/1000 there, the
     images are 1600x1000, so cover crops nothing. */
  .root :global(.showcase-frame) { aspect-ratio: 4 / 5; }
  .root :global(.showcase-shot) { object-position: 40% 0; }
}


/* ===========================================================================
   §02 — THE FEATURE TOUR, ELEVATED
   =========================================================================== */

/* The block that shrank the step wheel to 104px and padded the stage to clear
   it is gone with the wheel — see §103. Two rounds of measurement went into
   fitting a 124px circle into a 66px gutter, which is the argument the stepper
   settles: a vertical rail is 46px wide and the problem does not exist. */

/* A deeper swap between the three panels: they were fading with a 1.5% scale,
   which reads as a dissolve. Further back and further down is a handover. */
.root :global(.visual-layer) {
  transform: translateY(30px) scale(.955);
  transition: opacity .5s ease, transform .72s cubic-bezier(.2, .7, .2, 1);
}
.root :global(.visual-layer.is-active) { transform: none; }

/* The panel leans with the scroll. Small on purpose — it sits still for most
   of a 2,725px section, and anything larger would be a distraction. */
.root :global(.sticky-product) { perspective: 1600px; }
.root[data-motion="on"] :global(.sticky-product .visual-stage) {
  transform: rotateX(calc(3.2deg - var(--sp, 0) * 6.4deg));
}

/* How far through the three you are. The wheel says which; this says how much
   is left. No JS state — it reads the section's own progress.

   At the TOP of the pinned panel, not the bottom. The bottom is already two
   deep: the example marker sits at bottom:4vh and the scroll prompt beside it,
   and the marker is a 58px three-line pill — measured, a rail at 4vh+30px
   landed inside it and drew a line straight through the words. The panel
   centres a 565px visual in 868px, so the band above the visual is free. */
.root :global(.tour-rail) { display: none; }
.root[data-motion="on"] :global(.tour-rail) {
  display: block;
  position: absolute;
  left: 0; right: 0;
  top: 0;
  height: 2px;
  border-radius: 2px;
  background: rgba(174, 199, 211, .17);
  overflow: hidden;
}
.root[data-motion="on"] :global(.tour-rail s) {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--orange), var(--yellow));
  transform: scaleX(var(--sp, 0));
  transform-origin: 0 50%;
}
@media (max-width: 1100px) {
  .root[data-motion="on"] :global(.tour-rail) { display: none; }
}

/* §03 — the pipeline band and its self-drawing stroke lived here. The section
   is gone from the markup (see the note where it used to be in
   flagship-home.tsx), so its rules went with it. */

/* ===========================================================================
   §04 — THE TRACE UNDER EACH HANDOFF
   =========================================================================== */

/* .ai-split-story is a LIGHT/dark split — the copy column is on ink and the
   rail beside it is on cream, with near-white cards. Styled for a dark ground
   first time round, the trace measured 1.16:1: grey on white, invisible. These
   are the light-ground values, and they are measured, not guessed. */
.root :global(.ai-trace) {
  display: block;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed rgba(31, 45, 54, .18);
  font-family: var(--font-geist-mono), monospace;
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: .2px;
  color: #5c6870;
}
.root :global(.ai-trace i) { font-style: normal; color: #c2440e; margin-right: 5px; }
.root :global(.ai-trace b) { color: #1d2b33; font-weight: 650; }

/* Same ground, same problem, and these two predate the trace.

   The eyebrow labels — ATTRACT, QUALIFY, ONE CONNECTED WORKFLOW — were brand
   orange at 8px on a near-white card: about 2.9:1. And the rail's body copy,
   which is the actual explanation of what the AI does, was #6f7472 at 10px:
   measured 3.68:1. On a saturated brand hue the only readable direction is
   down, which is what the closing band already had to do.

   #c2440e measured 4.02:1 rather than the 4.89 its values predict — at 8px
   with letter-spacing, antialiasing never lets a glyph reach its full colour.
   Darker again, and verified rather than calculated. */
.root :global(.ai-split-story .ai-rail small) { color: #8f2f08; }
.root :global(.ai-split-story .ai-rail p) { color: #4e5a62; }

/* The rail's cards justify head-to-foot, which pushed the trace away from the
   copy it belongs to. Anchored to the text block instead. */
.root :global(.ai-rail-traced article) { justify-content: flex-start; gap: 16px; }

/* The section's own "invented request" marker was removed — three of them in
   the first two screens read as hedging rather than candour. The disclosure
   itself is not gone: the hero console and the feature tour each still carry
   one, and the command-center deck labels its own figures as sample data. */

/* ===========================================================================
   §05 — THE CONVERSATION PLAYS

   One shared clock: --beat is the beat number an element belongs to, 620ms
   apart. The portal steps sit on half-beats after the message that causes
   them, so the homeowner's "approved" visibly moves the job rather than
   arriving with it.

   It plays once, on reveal. A loop beside body copy competes with reading it.
   =========================================================================== */

.root[data-motion="on"] :global(.client-plays .msg),
.root[data-motion="on"] :global(.client-plays .portal-timeline > span) {
  opacity: 0;
}
.root[data-motion="on"] :global(.client-plays.is-in .msg),
.root[data-motion="on"] :global(.client-plays.is-in .portal-timeline > span) {
  animation: flagshipBeat .62s cubic-bezier(.2, .7, .3, 1) forwards;
  animation-delay: calc(var(--beat, 0) * 620ms + 260ms);
}
/* The last portal step has no --beat: it is the future, and it should arrive
   with the panel rather than appear to complete. */
.root[data-motion="on"] :global(.client-plays.is-in .portal-timeline > span:last-child) {
  animation-delay: 260ms;
  opacity: .55;
}

@keyframes flagshipBeat {
  from { opacity: 0; transform: translateY(9px); }
  to { opacity: 1; transform: none; }
}

/* ===========================================================================
   §06 — BENTO

   Eight identical cells said nothing here matters more than anything else.
   Quotes (01) and Payments (04) are what turn a lead into money; Texts + the
   client portal (07) is the one a homeowner actually touches. Those get the
   room. Nothing is dropped and no copy changes.
   =========================================================================== */

/* EVERY CELL IS PLACED EXPLICITLY, and it has to be. Auto-placement is sparse:
   the cursor never moves backwards, so a cell that spans two ROWS leaves the
   column beside it unreachable for everything that follows. A first pass with
   one 2x2 and one 2x1 in four columns left four empty cells — a hole in the
   right-hand column two rows deep.

   Three columns, eight items, twelve cells, no holes:
     ┌───────────┬─────┐
     │     01    │ 02  │   01 Quotes + e-sign, 2x2
     │  (2 x 2)  ├─────┤
     │           │ 03  │
     ├─────┬─────┼─────┤
     │ 04  │ 05  │ 06  │
     ├─────┴─────┼─────┤
     │     07    │ 08  │   07 Texts + client portal, 2x1
     └───────────┴─────┘
   Three columns rather than four for a second reason: at four, every small
   cell's description broke to three lines. */
.root :global(.suite-bento) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(158px, auto);
}
.root :global(.suite-bento article) { min-height: 0; }
.root :global(.suite-bento article:nth-child(1)) { grid-column: 1 / span 2; grid-row: 1 / span 2; }
.root :global(.suite-bento article:nth-child(2)) { grid-column: 3; grid-row: 1; }
.root :global(.suite-bento article:nth-child(3)) { grid-column: 3; grid-row: 2; }
.root :global(.suite-bento article:nth-child(4)) { grid-column: 1; grid-row: 3; }
.root :global(.suite-bento article:nth-child(5)) { grid-column: 2; grid-row: 3; }
.root :global(.suite-bento article:nth-child(6)) { grid-column: 3; grid-row: 3; }
.root :global(.suite-bento article:nth-child(7)) { grid-column: 1 / span 2; grid-row: 4; }
.root :global(.suite-bento article:nth-child(8)) { grid-column: 3; grid-row: 4; }

/* The card body copy is #6a706f on a near-white card face, which measures
   4.41-4.57:1 depending on where the sampler lands on the gradient — sitting
   exactly on the AA floor, sometimes over it and sometimes under. Not a
   judgement call worth leaving to antialiasing. */
.root :global(.suite-grid p) { color: #5f6564; }

/* The two given the room have to use it, or the grid reads as a mistake in the
   small cells' favour. The big cell's content sits at the bottom of its box —
   centred, a 2x2 cell with three lines in it looks empty rather than important. */
.root :global(.suite-bento article:nth-child(1)) { padding: 34px; align-content: end; }
.root :global(.suite-bento article:nth-child(1) h3) { font-size: 28px; }
.root :global(.suite-bento article:nth-child(1) p) { font-size: 15px; max-width: 36ch; }
.root :global(.suite-bento article:nth-child(7) h3) { font-size: 21px; }

/* Two columns, and NO spans — eight equal cells across four rows, which is the
   only arrangement that tiles. With item 1 and item 7 spanning, the five
   single cells between them add up to two and a half rows, so the grid ends up
   with a hole beside item 6 and another beside item 8: measured 78.7% coverage.
   A bento needs three columns to be a bento; below that it is a grid. */
@media (max-width: 1100px) {
  .root :global(.suite-bento) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  /* :nth-child(n) matches every child at the SAME specificity as the
     :nth-child(2..8) placements above, so this reset can actually beat them.
     A plain \`article\` selector cannot — it is a class-and-type (0,2,1) against
     their class-pseudo-type (0,3,1), so column 3 survived into the two-column
     layout and grid created an implicit third track to hold it. */
  .root :global(.suite-bento article:nth-child(n)) { grid-column: auto; grid-row: auto; }
}
@media (max-width: 760px) {
  .root :global(.suite-bento) { grid-template-columns: minmax(0, 1fr); }
  .root :global(.suite-bento article:nth-child(n)) { grid-column: auto; grid-row: auto; }
  .root :global(.suite-bento article:nth-child(1)) { padding: 27px; align-content: start; }
  .root :global(.suite-bento article:nth-child(1) h3) { font-size: 22px; }
  .root :global(.suite-bento article:nth-child(1) p) { font-size: 14px; }
}

/* ===========================================================================
   §07 — THE SCROLL WIPE

   Both cards occupy one grid cell; the patchwork sits on top and is clipped
   away left-to-right by the section's own progress, with a lit edge at the
   boundary carrying the VS label.

   Gated, and this one matters most: parked at --sp 0 the section would show
   nothing but the column arguing against us.
   =========================================================================== */

.root[data-motion="on"] :global(.stack-wipe) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  /* stretch, not the inherited center: the two cards have different content
     heights (437 and 430 measured), and centring each in the row left the
     shorter one inset — so the wipe exposed a sliver of the card underneath
     above and below it. Both fill the cell, so the boundary is one clean edge. */
  align-items: stretch;
  position: relative;
}
.root[data-motion="on"] :global(.stack-wipe .stack-card) { grid-area: 1 / 1; }

/* BOTH cards lean in 3D against the parent's perspective — the patchwork
   rotateY(3deg), the connected one rotateY(-3deg) translateZ(15px), so they
   splay away from each other like an open book. It is a nice touch beside a
   42px gutter and it cannot survive a wipe: two cards rotated opposite ways
   project to different boxes, and measured here they landed 4px apart and 7px
   different in height — so the clip edge and the card edge underneath it would
   not line up, and the seam would show all the way across.
   Flat for the wipe. Both keep their gradient, glow and accent bar. */
.root[data-motion="on"] :global(.stack-wipe .stack-card) { transform: none; }
/* THE EDGE SWEEPS DOWN, NOT ACROSS.
   The board's specimen wiped left to right, and measured on the real cards that
   is wrong: both are a list of "label … value" rows, so a VERTICAL boundary
   cuts every row in half and you read the label from one card beside the value
   from the other — "Website builder … CONNECTED". It looks like a rendering
   bug, not a comparison.
   A horizontal boundary swaps WHOLE ROWS, top to bottom, so each row is only
   ever one card or the other and the four capabilities convert one at a time.
   Same idea, axis corrected by measurement. */
.root[data-motion="on"] :global(.stack-wipe .stack-card.patchwork) {
  z-index: 2;
  -webkit-clip-path: inset(calc(var(--sp, 0) * 100%) 0 0 0);
  clip-path: inset(calc(var(--sp, 0) * 100%) 0 0 0);
}
.root[data-motion="on"] :global(.stack-wipe .versus) {
  position: absolute;
  left: -12px; right: -12px;
  top: calc(var(--sp, 0) * 100%);
  z-index: 3;
  height: 2px;
  width: auto;
  min-height: 0;
  display: block;
  background: linear-gradient(90deg, transparent, var(--orange) 14%, var(--orange) 86%, transparent);
  box-shadow: 0 0 18px 2px rgba(255, 106, 36, .4);
  /* Fully hidden at both ends, so the edge is never parked on a card face. */
  opacity: clamp(0, calc(min(var(--sp, 0), 1 - var(--sp, 0)) * 22), 1);
}
.root[data-motion="on"] :global(.stack-wipe .versus b) {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  padding: 4px 9px;
  border-radius: 3px;
  background: var(--orange);
  color: #35120a;
  font-family: var(--font-geist-mono), monospace;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.4px;
}
/* Below 760px the comparison is already one column per card, and a horizontal
   wipe has nowhere to travel. Both cards, side by side, as they are today. */
@media (max-width: 760px) {
  .root[data-motion="on"] :global(.stack-wipe) { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .root[data-motion="on"] :global(.stack-wipe .stack-card) { grid-area: auto; }
  .root[data-motion="on"] :global(.stack-wipe .stack-card.patchwork) { -webkit-clip-path: none; clip-path: none; }
  .root[data-motion="on"] :global(.stack-wipe .versus) { display: none; }
}

/* ===========================================================================
   §08 — THE FEE CALCULATOR ON A DARK BAND

   components/home-fee-calculator.tsx is shared with the other homepage
   candidates and styled in globals.css against the app's LIGHT tokens —
   --text, --accent, --gold-ink, --ink-rgb. Those resolve here too, to their
   light values, on a #0d222e band. Restated for this ground only.
   =========================================================================== */

.root :global(.hcalc) {
  max-width: 100%;
  margin: 30px 0 0;
  border-color: rgba(174, 199, 211, .19);
  border-radius: 14px;
  background: linear-gradient(150deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .012));
  box-shadow: 0 2px 0 rgba(255, 255, 255, .05) inset, 0 22px 50px rgba(0, 0, 0, .26);
}
.root :global(.hcalc-eyebrow) { color: var(--orange); }
.root :global(.hcalc-vol) { color: #cddae1; }
.root :global(.hcalc-vol strong) { color: #fff; }
.root :global(.hcalc-slider) { background: rgba(174, 199, 211, .18); }
.root :global(.hcalc-slider)::-webkit-slider-thumb { background: #fff; border: 3px solid var(--orange); }
.root :global(.hcalc-slider)::-moz-range-thumb { background: #fff; border: 3px solid var(--orange); }
/* The presets are buttons and were reading as plain text. globals gives them a
   1px border in var(--line) and a face of rgba(var(--tint), .03) — but --line
   is redefined inside .root as rgba(174,199,211,.17), and --tint is an app
   token that means nothing here, so the border and the face both vanished. */
.root :global(.hcalc-chip) {
  border-color: rgba(174, 199, 211, .34);
  background: rgba(255, 255, 255, .05);
  color: #b3c3cd;
}
.root :global(.hcalc-chip:hover) { color: #eef5f6; border-color: rgba(255, 106, 36, .6); }
.root :global(.hcalc-chip.is-on) { background: var(--orange); color: #35120a; border-color: var(--orange); }
.root :global(.hcalc-result) { border-color: rgba(174, 199, 211, .16); background: rgba(7, 19, 29, .34); }
.root :global(.hcalc-result-l) { color: #9db0bd; }
.root :global(.hcalc-result-v) { color: var(--orange); }
.root :global(.hcalc-result-s) { color: #9db0bd; }
.root :global(.hcalc-result-s strong) { color: #fff; }
.root :global(.hcalc-compare) { color: #a9bac4; }
.root :global(.hcalc-compare strong) { color: #fff; }
.root :global(.hcalc-kicker) { color: #a9bac4; }
.root :global(.hcalc-kicker strong) { color: var(--yellow); }

/* The band is a two-column grid whose copy column now carries the calculator,
   so the $0 dial no longer needs to be the same height as its neighbour. */
.root :global(.pricing-band) { align-items: center; }
.root :global(.pricing-copy) { max-width: 720px; }

/* ===========================================================================
   §09 — ONE DARK RUN TO THE END

   Measured from painted pixels, the page carried 8 tonal breaks and about
   2,000px of light section. The FAQ was one of them, sitting between a dark
   pricing band and the orange close. On ink it removes two breaks, and the
   closing band becomes the only one left — which is what makes it land as an
   arrival rather than the fourth change of ground.

   The <details> rows, the chevron and the structured data are untouched; this
   is a repaint.
   =========================================================================== */

.root :global(.home-faq-dark) {
  background:
    radial-gradient(circle at 88% 8%, rgba(255, 106, 36, .09), transparent 30%),
    linear-gradient(160deg, #0a1a25, #07131d);
  color: #eef5f6;
  border-top-color: rgba(174, 199, 211, .14);
}
/* The seven rows are CARDS, not bare text: rgba(255,255,255,.82) faces built
   for the cream band. Repainting the section and not them left #eef5f6 text on
   a near-white card — measured 2.13:1, the worst reading on the page and
   invisible in a screenshot of the band as a whole. Repaint the components on
   a ground, not just the ground. */
.root :global(.home-faq-dark .home-faq-list details) {
  border-color: rgba(174, 199, 211, .17);
  background: linear-gradient(150deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .014));
  box-shadow: 0 1px 0 rgba(255, 255, 255, .05) inset;
}
.root :global(.home-faq-dark .home-faq-list details[open]) {
  border-color: rgba(255, 106, 36, .3);
  background: linear-gradient(150deg, rgba(255, 106, 36, .07), rgba(255, 255, 255, .015));
}
.root :global(.home-faq-dark .home-faq-head h2) { color: #f3f7f8; }
.root :global(.home-faq-dark .home-faq-head > p) { color: #9db0bd; }
.root :global(.home-faq-dark .home-faq-list) { border-top-color: rgba(174, 199, 211, .16); }
.root :global(.home-faq-dark .home-faq-list details) { border-bottom-color: rgba(174, 199, 211, .16); }
.root :global(.home-faq-dark .home-faq-list summary) { color: #eef5f6; }
.root :global(.home-faq-dark .home-faq-list summary:hover) { color: #fff; }
.root :global(.home-faq-dark .home-faq-list summary)::after { color: var(--orange); }
.root :global(.home-faq-dark .home-faq-list details p) { color: #a9bac4; }

/* ===========================================================================
   THE COMMAND-CENTER BAND

   Six dashboard cards that were built for the previous homepage and stranded
   on /home-classic. The cards themselves are not restyled here — they are the
   same markup and the same generated rules /home-classic renders, so the two
   cannot drift. What this block does is make the band they sit in belong to
   this page.

   IT HAS TO BE A DARK BAND. The deck is built for one: --ink is #f7f5ef and
   every card face is a near-black panel. It lands between .included and
   .difference, which are both cream, so without a ground of its own the cards
   would be light-on-light. Dark here is not a rhythm choice, it is the only
   legible option — though it does give the page the alternation it wanted
   anyway, and matches .pricing-band further down.
   =========================================================================== */

.root :global(.command-band) {
  position: relative;
  padding: clamp(64px, 8vw, 118px) clamp(24px, 5vw, 86px);
  background:
    radial-gradient(circle at 84% 8%, rgba(255, 106, 36, .13), transparent 26%),
    radial-gradient(circle at 10% 88%, rgba(42, 130, 161, .12), transparent 28%),
    linear-gradient(160deg, #0d222e, #091923);
  border-top: 1px solid rgba(174, 199, 211, .12);
  border-bottom: 1px solid rgba(174, 199, 211, .12);
}

/* The deck centres itself at 1280px with its own gutters, which put its cards
   inboard of the bento's directly above — two grids of cards, not quite
   aligned, is the kind of near-miss that reads as a mistake. The band supplies
   the gutter instead, using the same clamp .included does, so the two grids
   share an edge. */
.root :global(.command-band .cc) {
  max-width: none;
  padding: 0;
}

/* The deck declares its own type stack (--sans: system-ui) because it shipped
   as a self-contained artifact. On this page that means one band rendering in
   the system font while everything above and below it is Geist — subtle enough
   to miss in a screenshot and obvious in the flow. Pointed at the app's fonts;
   --mono carries the app's alias, so the card labels match the page's other
   mono labels rather than Consolas. */
.root :global(.command-band .cc-root) {
  --sans: var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif;
  /* --font-geist-mono is this file's own alias and already carries a fallback
     chain, so it is used bare here rather than followed by a second copy. */
  --mono: var(--font-geist-mono);
}

/* The band already has an orange bloom in its own gradient; the deck's aurora
   on top of it is two soft glows fighting in the same corner. The deck keeps
   its film grain. */
.root :global(.command-band .cc-root)::before { display: none; }

/* .included drops to a 20px gutter on a phone, and the band's clamp bottoms out
   at 24 — close enough to look like a mistake rather than a difference. Matched
   exactly, so the cards and the bento cells above share both edges at every
   width. */
@media (max-width: 760px) {
  .root :global(.command-band) { padding-left: 20px; padding-right: 20px; }
}

/* ===========================================================================
   TEXT ON ORANGE

   White on the brand orange measures 2.94:1. That is the loudest button on
   every page, and it fails AA for normal text by a wide margin — there is no
   size at which 2.94 is acceptable.

   Two ways out: darken the orange until white works, or put dark ink on the
   orange. White needs roughly #a13d00 to reach 4.5:1, which is brown and is no
   longer the brand. So the orange is kept exactly and the text goes dark.

   ONE ink for every text-on-orange surface, warm rather than navy so it reads
   as part of the orange rather than dropped on top of it. #3d1200 on #ff6a24
   is 5.71:1 — and the closing band already used a warm dark for its body copy
   and eyebrow, so this makes that band consistent instead of half-converted.
   =========================================================================== */

.root {
  --ink-on-orange: #3d1200;
}

.root :global(.button.primary) { color: var(--ink-on-orange); }
.root :global(.button.primary span) { color: inherit; }

/* .button.primary.light is white-on-ink, not ink-on-orange — it is the closing
   band's CTA and already measures 18.28:1. Left alone. */
.root :global(.button.primary.light) { color: #07131d; }

/* The fixed bar is the only control on the page for most of a phone scroll. */
@media (max-width: 760px) {
  .root :global(.mobile-cta) { color: var(--ink-on-orange); }
}

/* The closing headline was the last white thing on the orange: 2.60:1 at 98px.
   Large text only needs 3:1 and it did not reach that either. Its own section's
   eyebrow, body and fineprint were already dark; only the headline had been
   missed, which is why the band looked fine in a screenshot of the small copy
   and failed on the one line everybody actually reads. */
.root :global(.final-cta h2) { color: var(--ink-on-orange); }

/* ===========================================================================
   THE MOBILE MENU

   .site-header nav is display:none below 760px and nothing replaced it. Every
   destination on the site — Features, How it works, For your trade, Pricing,
   Founder — existed on a phone only in the footer, 18,000px down the homepage.
   A visitor who wanted the price had to scroll the entire page to find out
   where to look.
   =========================================================================== */

.root :global(.nav-toggle) {
  display: none;
  width: 44px; height: 44px;            /* a real touch target, not a 24px icon */
  margin-left: 4px;
  align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 11px;
  background: rgba(255, 255, 255, .03);
  color: #eef5f6;
}
.root :global(.nav-toggle:hover) { border-color: rgba(255, 106, 36, .5); }
.root :global(.nav-toggle-bars) { display: grid; gap: 4px; width: 18px; }
.root :global(.nav-toggle-bars i) {
  display: block; height: 2px; border-radius: 2px; background: currentColor;
  transition: transform .22s ease, opacity .18s ease;
}
/* The bars become an X, so the control says what it will do next. */
.root :global([data-menu="open"] .nav-toggle-bars i:nth-child(1)) { transform: translateY(6px) rotate(45deg); }
.root :global([data-menu="open"] .nav-toggle-bars i:nth-child(2)) { opacity: 0; }
.root :global([data-menu="open"] .nav-toggle-bars i:nth-child(3)) { transform: translateY(-6px) rotate(-45deg); }

.root :global(.site-menu) {
  position: absolute;
  left: 0; right: 0; top: 100%;
  padding: 10px 20px 22px;
  background: linear-gradient(180deg, #0d222e, #091923);
  border-bottom: 1px solid rgba(174, 199, 211, .16);
  box-shadow: 0 26px 60px rgba(0, 0, 0, .45);
}
.root :global(.site-menu nav) { display: grid; }
.root :global(.site-menu nav a) {
  display: block;
  padding: 15px 2px;
  font-size: 16px;                       /* the audit's floor for real copy */
  font-weight: 600;
  color: #eef5f6;
  border-bottom: 1px solid rgba(174, 199, 211, .13);
}
.root :global(.site-menu nav a:hover) { color: var(--orange); }
.root :global(.site-menu-cta) {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  margin-top: 18px; min-height: 50px;
  border-radius: 11px;
  background: var(--orange);
  color: var(--ink-on-orange);
  font-size: 15px; font-weight: 800;
}

/* The header has to be the containing block for the panel, and has to sit over
   the page. It is already sticky; this only names the relationship. */
@media (max-width: 760px) {
  .root :global(.site-header) { position: sticky; top: 0; z-index: 40; }
  .root :global(.nav-toggle) { display: flex; }
}

/* Above the breakpoint the real nav is back, so the drawer and its button have
   no job. \`hidden\` already removes the panel from the tree at every width when
   it is closed; this stops an open panel surviving a resize. */
@media (min-width: 761px) {
  .root :global(.site-menu) { display: none; }
}

/* ===========================================================================
   TYPE SIZES

   Forty-two rules of real page copy rendered below 12px, down to 6px. Not
   captions — the bento's feature descriptions, the AI rail's explanation of
   what the AI actually does, the comparison's labels, the pricing fine print,
   and the "this is an invented example" disclosure, which is the one line on
   the page it is least acceptable to make hard to read.

   THE LINE THIS DRAWS. A further seventy-five rules sit INSIDE the product
   mockups — the dashboard console, the phone screens, the deck's six card
   screens. Those are pictures of software. A screenshot's 7px timestamp is not
   copy a visitor is asked to read; enlarging it would break both the illusion
   and the layout, and they are already aria-hidden. Left exactly as they are.

   The policy applied below:
     descriptions and body copy   ->  14px
     values and secondary copy    ->  12-13px
     uppercase structural labels  ->  11px
   =========================================================================== */

/* -- descriptions and body copy -------------------------------------------- */
.root :global(.ai-split-story .ai-rail p) { font-size: 14px; line-height: 1.6; }
.root :global(.suite-grid p) { font-size: 14px; line-height: 1.6; }
.root :global(.stack-card p) { font-size: 14px; line-height: 1.55; }
.root :global(.client-benefits small) { font-size: 14px; line-height: 1.5; }

/* The disclosure. It says the figures above it are invented, and it was set at
   8.5px — smaller than everything it disqualifies. */
.root :global(.example-mark),
.root :global(.sticky-product .example-mark),
.root :global(.hero-stage .hero-product .example-mark) { font-size: 12px; letter-spacing: .04em; }

/* -- values and secondary copy --------------------------------------------- */
.root :global(.difference-proof small) { font-size: 13px; }
.root :global(.pricing-fineprint) { font-size: 13px; }
/* .stack-card li b and .sticky-product .example-mark are both (0,3,x) rules
   further up this file, so a plain .stack-card b / .example-mark loses. Matched
   at their own depth rather than nudged with !important. */
.root :global(.stack-card li span) { font-size: 13px; }
.root :global(.stack-card li b) { font-size: 12px; }
.root :global(.trust-strip b) { font-size: 12px; }
.root :global(.price-zero small) { font-size: 12px; }
.root :global(.footer-links a) { font-size: 13px; }

/* -- uppercase structural labels ------------------------------------------- */
.root :global(.feature-kicker),
.root :global(.step-number),
.root :global(.feature-handoff small),
.root :global(.ai-list-head small),
.root :global(.ai-list-head span),
.root :global(.ai-context-note),
.root :global(.ai-context-note span),
.root :global(.ai-split-story .ai-rail small),
.root :global(.ai-split-story .ai-rail article > span),
.root :global(.stack-label span),
.root :global(.suite-grid article > span),
.root :global(.hero-scale small),
.root :global(.cc-sample-pill) { font-size: 11px; }

/* The trace is a mono log line under each handoff — a label, not prose, but it
   was a point below the labels around it. */
.root :global(.ai-trace) { font-size: 11px; }

/* The step wheel's numerals live in 24px nodes, so this is the ceiling before
   the digits stop fitting their circles rather than a free choice. The same
   step number is also printed at 11px beside the panel, so nothing here is the
   only copy of anything. */


@media (max-width: 760px) {
  /* The header CTA is a control, not a caption. */
  .root :global(.header-cta) { font-size: 12px; }
}

/* ===========================================================================
   THE FIXED MOBILE BAR

   data-redundant is set by SiteFooter whenever another copy of the same offer
   is already on screen — the hero's CTA at the top, the closing band or the
   footer at the bottom. It starts "true", so the bar is absent on first paint
   rather than flashing in and being observed away.
   =========================================================================== */
.root :global(.mobile-cta[data-redundant="true"]) { display: none; }

/* ===========================================================================
   THE FEE, WRITTEN DOWN

   Four brackets on a dark band. Tabular figures so the percentages line up as
   a column — they are meant to be compared to each other, which is the whole
   point of showing that the rate falls.
   =========================================================================== */

.root :global(.fee-tiers) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 26px 0 0;
  border: 1px solid rgba(174, 199, 211, .18);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(174, 199, 211, .18);   /* shows through the gap as hairlines */
}
.root :global(.fee-tiers li) {
  padding: 14px 10px;
  background: linear-gradient(160deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .015));
  text-align: center;
}
.root :global(.fee-tiers b) {
  display: block;
  font-size: 19px; font-weight: 750; letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
  color: #f3f7f8;
}
.root :global(.fee-tiers small) {
  display: block; margin-top: 4px;
  font-size: 11px; letter-spacing: .06em;
  font-family: var(--font-geist-mono), monospace;
  /* #9db0bd measured 4.85:1 at 1440 but 4.44 at 390 — the band's gradient is
     lighter under this block once it reflows to two columns, and 11px letter-
     spaced mono never reaches its specified colour anyway. Lightened until it
     clears at the width where it was worst, not the width where it looked ok. */
  color: #b8c8d3;
}
.root :global(.fee-note) {
  margin: 14px 0 0;
  max-width: 62ch;
  font-size: 14px; line-height: 1.6;
  color: #a9bac4;
}
.root :global(.fee-note a) { color: var(--orange); text-decoration: underline; text-underline-offset: 3px; }
.root :global(.pricing-fineprint b) { color: #cfdbe2; font-weight: 700; }

@media (max-width: 600px) {
  .root :global(.fee-tiers) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* ===========================================================================
   §90 — THE LOGO STOPS BEING CROPPED BY HAND
   ===========================================================================
   The source sheet fits the logo into a fixed 56px-tall box with
   \`overflow: hidden\`, then sizes the image by WIDTH (105%, height auto) and
   translates it up to hide the transparent padding baked into the asset.

   Two dimensions, one of them fixed and one of them following the viewport, and
   a crop tuned for whatever width it was tuned at. On a wide screen the box is
   220px across, so the image rendered ~80px tall inside 56px of box: 6.6px lost
   off the top and 17.7px off the bottom, which is the clipped border.

   The asset is now trimmed to exactly the artwork (see
   scripts/generate-logo-assets.mjs), so nothing needs cropping. The box takes
   its width FROM the image rather than imposing one, and the image is sized by
   the one dimension that is actually fixed — its height. Nothing can clip at
   any viewport width because nothing overflows. */
.root :global(.brand-logo) {
  width: auto;
  height: 56px;
  display: block;
  overflow: visible;
}
.root :global(.brand-logo img) {
  display: block;
  height: 100%;
  width: auto;
  max-width: none;
  transform: none;
}
.root :global(.footer-logo) { width: auto; height: 64px; }

@media (max-width: 760px) {
  .root :global(.site-header .brand-logo) { width: auto; height: 40px; }
}

/* ===========================================================================
   §91 — SIGN IN
   ===========================================================================
   Quiet beside the primary action: it is the door back in for somebody who
   already has an account, not what this page is selling. Sized to the same 44px
   touch floor as everything else in the header. */
.root :global(.header-signin) {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  margin-left: auto;
  padding: 0 14px;
  border-radius: 10px;
  color: #cfdbe2;
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
  transition: color .18s ease, background .18s ease;
}
.root :global(.header-signin:hover) { color: #fff; background: rgba(255,255,255,.06); }

/* The header CTA used to be the element pushed right; now Sign in is, and the
   CTA follows it. Without this the two separate and the CTA drifts to the far
   edge on a wide screen. */
.root :global(.site-header .header-cta) { margin-left: 0; }

/* AND THE HEADER NEEDS A REAL GAP NOW.
   It is justify-content: space-between, which was doing two jobs: separating
   the groups AND supplying the space between the logo and the first nav link.
   Pushing Sign in right with margin-left:auto takes the second job away — the
   free space all collects in one place, so brand and nav end up touching. They
   did not before only because the logo asset had transparent padding baked into
   its right edge; trimming it (see §90) removed the accidental spacer. */
.root :global(.site-header) { gap: clamp(16px, 2.4vw, 40px); }

.root :global(.site-menu-signin) {
  display: block;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(174,199,211,.14);
  color: #9db0bd;
  font-size: 14px;
  text-decoration: none;
}
.root :global(.site-menu-signin b) { color: var(--orange); font-weight: 750; }

@media (max-width: 900px) {
  /* Below this the hamburger appears and the row runs out of room; Sign in
     lives in the drawer, where it is already repeated. */
  .root :global(.header-signin) { display: none; }
}

/* ===========================================================================
   §91b — THE SECOND KICKER LINE
   ===========================================================================
   Sits between the eyebrow and the headline: bigger than the eyebrow, quieter
   than the h2, so the three lines read as a descending order rather than as two
   competing labels. */
.root :global(.section-kicker) {
  margin: 10px 0 14px;
  color: #e6eef2;
  font-size: clamp(19px, 2.1vw, 27px);
  font-weight: 850;
  letter-spacing: .01em;
  line-height: 1.1;
  text-transform: uppercase;
}

/* ===========================================================================
   §92 — THE $0 IS A CIRCLE
   ===========================================================================
   It was drawn as \`height: 460px; border-radius: 50%\` with NO WIDTH — so its
   width came from the grid column it happens to sit in (.72fr of a two-column
   band). Measured at 1440 that is ~407px against a 460px height: a 50% radius
   on a non-square box is an ellipse, which is the dim oval.

   Square first, then lit. The glow was two very low-alpha layers (.14 fill,
   .1 shadow); it now reads as a light source rather than a smudge. */
.root :global(.price-zero) {
  /* One dimension, and the other follows it. min() keeps it inside its column
     on a laptop instead of forcing the band wider. */
  width: min(460px, 100%);
  height: auto;
  aspect-ratio: 1 / 1;
  margin-inline: auto;
  border-color: rgba(255,138,61,.34);
  background:
    radial-gradient(circle at 50% 50%, rgba(255,106,36,.30), rgba(255,106,36,.10) 46%, transparent 68%);
  box-shadow:
    0 0 90px rgba(255,106,36,.34),
    0 0 200px rgba(255,106,36,.16),
    0 0 0 1px rgba(255,138,61,.16),
    0 40px 85px rgba(0,0,0,.32);
}
.root :global(.price-zero)::before {
  inset: 7.8%;
  border-color: rgba(255,138,61,.20);
  box-shadow: 0 0 60px rgba(255,106,36,.20) inset;
}
.root :global(.price-zero)::after {
  inset: 17%;
  border-color: rgba(255,138,61,.13);
}

/* THE $0 IS CENTRED IN IT.
   The glyph was pushed off-centre by two hand-tuned offsets that assumed the
   old oval: the "$" carried margin-top:-80px and the "0" a -18px letter-spacing,
   which on a single character is pure right-hand trim. Laid out as a row on the
   shared baseline instead, so the pair sits in the middle of the circle. */
.root :global(.price-zero span) {
  align-self: auto;
  margin-top: 0;
  font-size: clamp(30px, 7cqw, 48px);
  line-height: 1;
  translate: 0 -.42em;
}
.root :global(.price-zero strong) {
  font-size: clamp(140px, 34cqw, 230px);
  letter-spacing: 0;
  line-height: .8;
}
.root :global(.price-zero small) {
  bottom: 18%;
  white-space: nowrap;
}
/* cqw above needs a container to measure. */
.root :global(.price-zero) { container-type: inline-size; }

/* ===========================================================================
   §93 — THE HERO SLIDER'S DOTS
   ===========================================================================
   Three named buttons under the frame became three dots ON it. The names were
   doing real work — they said what else was in the product — but they also read
   as a second row of controls under the screenshot, and the screenshot is the
   thing being looked at. The names survive as accessible labels and as the
   tooltip; what is on screen is a position indicator.

   Still buttons, still a tablist, still 44px of touch target: the dot is drawn
   inside a transparent box rather than being the target itself. */
.root :global(.showcase-tabs) {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 0;
  margin: 0;
  padding: 0 0 6px;
  /* A wash so the dots hold against a light screenshot without drawing a bar
     across the image. */
  background: linear-gradient(to top, rgba(6,11,17,.55), transparent);
  border-radius: 0 0 18px 18px;
  pointer-events: none;
}
.root :global(.showcase-tabs button) {
  pointer-events: auto;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  /* The label is the accessible name; it must not be painted. */
  font-size: 0;
  line-height: 0;
  color: transparent;
}
.root :global(.showcase-tabs button:hover) { background: none; border: 0; }
.root :global(.showcase-tabs button[data-on="true"]) { background: none; border: 0; }

.root :global(.showcase-tabs i) {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255,255,255,.42);
  box-shadow: 0 1px 3px rgba(0,0,0,.5);
  transition: background .2s ease, transform .2s ease;
}
.root :global(.showcase-tabs button:hover i) { background: rgba(255,255,255,.7); }
.root :global(.showcase-tabs button[data-on="true"] i) {
  background: rgba(255,255,255,.28);
  transform: scale(1.15);
}
/* The dwell timer still fills the active dot — the rotation stays legible
   rather than being something that just happens to you. */
.root :global(.showcase-tabs button[data-on="true"] i s) { background: var(--orange); }

.root :global(.showcase-tabs button:focus-visible) {
  outline: 2px solid var(--orange);
  outline-offset: -6px;
}

@media (max-width: 760px) {
  .root :global(.showcase-tabs) { padding-bottom: 2px; }
  .root :global(.showcase-tabs button) { width: 44px; height: 40px; }
}

/* ===========================================================================
   §94 — THE HERO PILLARS ARE LINKS
   ===========================================================================
   Four labelled icons that answered nothing. They now point at four named
   groups on /features.

   THE ANCHOR TAKES OVER THE GRID rather than sitting inside it. The li was the
   grid container (icon over label, both left-aligned); if the link were just
   another child, the target would be the two words and nothing else — a 13px
   strip in a 90px tile. Handing the grid to the anchor makes the whole tile,
   icon included, one target, with no padding tricks that would make the four
   hit areas overlap across a 14px gap. */
.root :global(.hero-pillars li) { display: block; }

.root :global(.hero-pillars a) {
  display: grid;
  justify-items: start;
  align-content: start;
  gap: 11px;
  color: inherit;
  text-decoration: none;
  border-radius: 14px;
  transition: transform .18s ease;
}

/* The tone vars live on the li, so everything below still reads the right
   colour without repeating the four-way table. */
.root :global(.hero-pillars a:hover) { transform: translateY(-2px); }
.root :global(.hero-pillars a:hover .pillar-icon),
.root :global(.hero-pillars a:focus-visible .pillar-icon) {
  border-color: var(--tone);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .3);
}
.root :global(.hero-pillars a:hover b) {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.root :global(.hero-pillars a:focus-visible) {
  outline: 2px solid var(--orange);
  outline-offset: 6px;
}

@media (hover: none) {
  .root :global(.hero-pillars a:hover) { transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .root :global(.hero-pillars a) { transition: none; }
  .root :global(.hero-pillars a:hover) { transform: none; }
}

/* ===========================================================================
   §95 — THE TRUST STRIP: LINKED, AND READABLE
   ===========================================================================
   TWO CHANGES, ONE OF WHICH IS A CONTRAST FIX AND NOT A PREFERENCE.

   The label was var(--orange) on --cream: #ff6a24 on #f5f0e7 is 2.50:1, and
   the cell's own gradient washes it lighter still. WCAG AA wants 4.5:1 for
   text that size. #b8430f on the same ground measures 4.85:1 and is the same
   hue family, so the strip still reads as brand orange rather than as brown.
   The body line moves 12.5px -> 14px and #3f4b52 -> #1f2c34 (12.3:1).

   THE LINK IS INSIDE THE CELL, NOT THE CELL. Everything that draws this strip
   — grid, hairlines, corner number, the left rule that fills on hover, and
   four padding values across three breakpoints — is written against
   .trust-strip span, mostly in the generated source above where it cannot be
   re-aimed. So the span stays the cell and the anchor fills it; the padding
   moves onto the anchor so the target is the whole cell and not two lines of
   text. "flex: 1" is what fills it — the span is a column flex container, so
   stretch only governs width and the anchor would otherwise be content-height. */
.root :global(.trust-strip span) {
  padding: 0;
  font-size: 14px;
  color: #1f2c34;
}

.root :global(.trust-strip span > a) {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 25px 16px 30px;
  color: inherit;
  text-decoration: none;
}

.root :global(.trust-strip b) {
  font-size: 12.5px;
  letter-spacing: 1.3px;
  color: #b8430f;
  margin-bottom: 7px;
}

/* Same fix for the corner number, which was 1.9:1. */
.root :global(.trust-strip span)::after { color: rgba(184, 67, 15, .8); }

/* The lift and the left rule were hover-only, so a keyboard never saw either.
   :focus-within is on the span because that is what carries both effects. */
.root :global(.trust-strip span:focus-within) {
  background: var(--paper);
  transform: translateY(-3px);
}
.root :global(.trust-strip span:focus-within)::before { opacity: 1; }
.root :global(.trust-strip span > a:focus-visible) {
  outline: 2px solid var(--orange);
  outline-offset: -5px;
}
.root :global(.trust-strip a:hover b) {
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 760px) {
  .root :global(.trust-strip span) { font-size: 13.5px; }
  .root :global(.trust-strip span > a) { padding: 15px 14px 15px 22px; }
}

/* ===========================================================================
   §96 — WHERE THE HOMEPAGE LINKS LAND
   ===========================================================================
   Nine ids are linked from the homepage: five feature cards from the strip
   under the hero, four capability groups from the four badges. The header is
   fixed at 82px (68px on a phone), so without scroll-margin every one of them
   arrives underneath it. */
/* The four capability ids now sit on the stage tabs (§107), which are what a
   fragment should land on: following /features#payments both scrolls TO that
   stage and selects it. */
.root :global(.feature-link-grid > a[id]),
.root :global(.jrs-rail [role="tab"]) { scroll-margin-top: 104px; }

@media (max-width: 760px) {
  .root :global(.feature-link-grid > a[id]),
  .root :global(.jrs-rail [role="tab"]) { scroll-margin-top: 88px; }
}

/* The four capability bands that used to live here — number, heading,
   sentence, tool cards, four times — are §107 now. */

/* ===========================================================================
   §97 — THE HOMEPAGE STOPS SAYING THINGS TWICE
   ===========================================================================
   Four merges, one deletion, and the styling that follows from them.

   The page ran: hero, four outcome badges, four "included" tiles, three
   flagship cards, a full-length AI section whose first two steps re-explained
   the flagship cards, a client-portal demonstration, a grid naming eight
   capabilities, and then six full-height product screens showing six of those
   same eight. A visitor was told about the product three times before being
   shown it, and the showing was six screens of scrolling.

   Nothing below is decoration. Each block is what one of those merges needs. */

/* -- decorative headings, demoted ------------------------------------------ */
/* Three <h3>s belonged to DRAWINGS of a product, not to this document: a fake
   homeowner's website headline, a fake intake question and a fake job title,
   sitting in the heading outline between real section headings with nothing to
   say they were part of a picture. They are paragraphs now, and these three
   rules carry the exact type they had as headings. */
.root :global(.preview-headline) {
  margin: 13px 0 22px;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -1.2px;
  line-height: 1.05;
}
.root :global(.phone-shell .intake-headline) {
  margin: 8px 0 14px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.05;
}
.root :global(.quick-title .quick-headline) {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

/* -- the flagship cards get somewhere to go -------------------------------- */
.root :global(.feature-step-link) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
  padding: 9px 15px;
  border: 1px solid rgba(255, 106, 36, 0.4);
  border-radius: 999px;
  background: rgba(255, 106, 36, 0.07);
  color: #ffb071;
  font-size: 12.5px;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.root :global(.feature-step-link:hover) {
  background: rgba(255, 106, 36, 0.16);
  border-color: var(--orange);
}
.root :global(.feature-step-link:focus-visible) { outline: 2px solid var(--orange); outline-offset: 3px; }

/* -- the four handoffs, as a row ------------------------------------------- */
/* This replaces a full-length section. It sits INSIDE .flagships, after the
   scrolly layout, so the chain reads as a footnote to the three cards it is
   describing rather than as a fourth claim of its own. */
.root :global(.flow-strip) {
  margin: clamp(44px, 5vw, 72px) auto 0;
  max-width: 1180px;
  padding-top: clamp(28px, 3vw, 40px);
  border-top: 1px solid rgba(174, 199, 211, 0.14);
}
.root :global(.flow-strip ol) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: lgq-flow;
}
.root :global(.flow-strip li) {
  position: relative;
  margin: 0;
  padding-left: 18px;
}
/* The arrow between steps is drawn, not typed: four literal → characters would
   be read out by a screen reader as four stray glyphs, and the last one would
   point at nothing. */
.root :global(.flow-strip li)::before {
  content: "";
  position: absolute;
  left: 0;
  top: 7px;
  width: 6px;
  height: 6px;
  border-top: 1.5px solid var(--orange);
  border-right: 1.5px solid var(--orange);
  transform: rotate(45deg);
}
.root :global(.flow-strip li:first-child)::before { opacity: 0.35; }
.root :global(.flow-step) {
  display: block;
  color: #e7eef2;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.2px;
}
.root :global(.flow-strip small) {
  display: block;
  margin-top: 5px;
  color: #93a7b3;
  font-size: 12px;
  line-height: 1.5;
}
.root :global(.flow-strip > p) {
  margin: clamp(22px, 2.4vw, 30px) 0 0;
  max-width: 62ch;
  color: #a9bac4;
  font-size: clamp(14px, 1.15vw, 16px);
  line-height: 1.6;
}

@media (max-width: 760px) {
  .root :global(.flow-strip ol) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; }
}

/* -- the merged suite section ---------------------------------------------- */
/* The tab strip that drives the product screen. Scrolls rather than wraps: a
   second row of tabs moves the screen down the page every time it happens, and
   these are short enough that a swipe is the natural gesture. */
.root :global(.suite-tabs) {
  display: flex;
  gap: 8px;
  margin: 0 0 18px;
  padding-bottom: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.root :global(.suite-tabs)::-webkit-scrollbar { display: none; }
.root :global(.suite-tabs button) {
  flex: 0 0 auto;
  /* 44px of target, from the padding rather than from a min-height, so the
     text stays vertically centred at every font size. */
  padding: 12px 17px;
  border: 1px solid rgba(164, 153, 137, 0.5);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.42);
  color: #4a5158;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.root :global(.suite-tabs button:hover) { background: var(--paper); color: var(--ink); }
.root :global(.suite-tabs button.is-on) {
  border-color: var(--orange);
  background: rgba(255, 106, 36, 0.12);
  color: #a3511b;
}
.root :global(.suite-tabs button:focus-visible) { outline: 2px solid var(--orange); outline-offset: 2px; }

/* The dwell timer on the active tab. The rotation is fast, and a screen that
   changes for no visible reason reads as a bug rather than as a tour. */
.root :global(.suite-tabs button) { position: relative; overflow: hidden; }
.root :global(.suite-tab-dwell) {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: var(--orange);
  transform-origin: left;
  animation: lgqSuiteDwell var(--dwell) linear forwards;
}
@keyframes lgqSuiteDwell { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
  .root :global(.suite-tab-dwell) { display: none; }
}

/* THE PANEL MUST NOT JUMP AS THE SCREENS ROTATE.
   The five mockups are different heights and a panel that resizes five times
   in six seconds drags every section below it up and down the page. Measured
   at 1440 the box ran 595–722px, so 740 holds all five with the shortest
   centred rather than top-aligned above a gap.

   THE RESERVATION IS DESKTOP-ONLY, and so is the rotation (see SUITE_ROTATE_MIN
   in flagship-home). The spread is 123px between the tallest and shortest card
   at 1440 and 476px at 390, where the leads pipeline is more than twice the
   height of the schedule — reserving for that would put a screen and a half of
   whitespace under every short one. Below the breakpoint the tabs still work,
   they just wait to be pressed. */
.root :global(.suite-screen) { margin-bottom: clamp(34px, 4vw, 54px); }

@media (min-width: 1024px) {
  .root :global(.suite-screen) {
    display: grid;
    align-content: center;
    min-height: 740px;
  }
}

/* One screen, not six stacked. The deck's own layout gapped six full-height
   cards down the page; with one card there is nothing to gap. */
.root :global(.cc-single .cc-deck) { display: block; gap: 0; }
.root :global(.cc-single .cc-card) { margin: 0; }

/* -- the suite cards become links ------------------------------------------ */
/* The <article> is untouched — roughly twenty rules across five breakpoints
   are written against it. The title is the link and its ::after covers the
   card, so the whole tile is the target and the accessible name is the title
   rather than "read more". */
.root :global(.suite-card-link) { color: inherit; text-decoration: none; }
.root :global(.suite-card-link)::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.root :global(.suite-grid article:hover .suite-card-link) { color: #a3511b; }
.root :global(.suite-card-link:focus-visible)::after { outline: 2px solid var(--orange); outline-offset: -3px; }

/* Sits over the decorative corner circle the card already draws, which is why
   it is positioned rather than placed in flow. */
.root :global(.suite-card-go) {
  position: absolute;
  right: 18px;
  bottom: 15px;
  z-index: 1;
  color: var(--orange);
  font-size: 15px;
  opacity: 0.55;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.root :global(.suite-grid article:hover .suite-card-go) { opacity: 1; transform: translateX(3px); }

/* -- the hero was sized around the badges that are no longer in it ---------- */
/* min-height: 900px was tuned to a copy column that ended with four pillar
   tiles. Take them out and the number stops describing anything — measured at
   1440 it left about 200px of empty gradient under the CTA, which reads as the
   page having lost something rather than as breathing room. The content sets
   the height now, with a floor low enough that a short viewport is not padded
   and high enough that the hero still fills a laptop screen. */
.root :global(.hero.hero-split) {
  min-height: min(760px, 88vh);
  padding-top: clamp(128px, 13vw, 160px);
  padding-bottom: clamp(56px, 6vw, 84px);
}

/* -- the footer's legal row ------------------------------------------------ */
.root :global(.footer-legal) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 20px;
  margin: 14px 0 0;
}
.root :global(.footer-legal a) {
  color: #7e9099;
  font-size: 12px;
  text-decoration: none;
}
.root :global(.footer-legal a:hover) { color: #cfdbe2; text-decoration: underline; }

/* ===========================================================================
   §98 — THE FEATURES PAGE STOPS READING AS A BROCHURE
   ===========================================================================
   Four measured problems, all on /features, all of them structural.

   Every number below was read off painted pixels at the width named, not off
   the declared values — see the note on each block for what was measured. */

/* -- the closing band, which nobody could read ------------------------------

   Measured at 1440 against the band's own gradient, sampled with the glyphs
   hidden so the sample is the real backdrop and not a blend:

     the fee explanation   1.12:1   (needs 4.5)
     the reassurance line  3.60:1   (needs 4.5, and set at 9px)
     the eyebrow           4.41:1   (needs 4.5, so it missed by a hair)
     the headline          2.55:1   (needs 3, and it is the biggest thing here)

   THE CAUSE OF THE FIRST ONE IS WORTH WRITING DOWN, because it is invisible in
   the source. .page-cta sets \`color: white\` on the SECTION, and there is a
   bare \`p { color: var(--muted) }\` type rule in globals.css. A type selector
   beats inheritance every time, so the paragraph never saw the white it was
   nominally given and rendered dark-theme grey on orange instead. The one line
   carrying the actual price of the product was, in practice, not there.

   .final-cta — the homepage's closing band, the same design — was measured and
   fixed months ago and this one was never given the same treatment. Same
   colours, deliberately: #4a1704 measures 5.9–6.2:1 across this band's
   gradient, and --ink-on-orange 6.8:1. White cannot fix a saturated orange; on
   this hue the readable direction is down. */
.root :global(.page-cta h2) { color: var(--ink-on-orange); }
.root :global(.page-cta > p:not(.eyebrow)),
.root :global(.page-cta > small),
.root :global(.page-cta .eyebrow) { color: #4a1704; }
/* The mark inside the eyebrow stays white — it is a glyph, not a word. */
.root :global(.page-cta .eyebrow span) { color: #ffffff; }
/* 9px, for the sentence that answers "what will this cost me to try". */
.root :global(.page-cta > small) { font-size: 12.5px; letter-spacing: .02em; }

/* -- the nav switches to a menu 320px earlier -------------------------------

   The five nav links never wrapped to a second row — measured rows=1 at every
   width — so the visible symptom was somewhere else: the account button's
   LABEL wrapped to two lines at 960, 820 and 768 (41px tall becoming 58px),
   and the gap between the logo and the first link closed from 35px at 1440 to
   18px at 768. The row was not broken, it was out of room, and the button that
   matters was the thing paying for it.

   The drawer already exists and is already what a phone gets. It just started
   too late. Sticky positioning stays at 760 on purpose: above that the header
   is \`position: fixed\` and every hero's padding-top is measured against a
   header that takes no space in flow — switching earlier would push the hero
   down by 82px, which is the exact opposite of the block below. Fixed is a
   containing block too, so the panel still hangs off it correctly. */
/* \`> nav\` and not \`nav\`: the drawer lives INSIDE .site-header and carries a
   nav of its own, so the loose descendant selector the base sheet uses hides
   the drawer's links too. It gets away with it there only because
   \`.site-menu nav { display: grid }\` is declared later in the file and wins on
   source order — which stops being true for anything written after it. */
@media (max-width: 1080px) {
  .root :global(.site-header > nav) { display: none; }
  .root :global(.nav-toggle) { display: flex; }
}
/* The 761px floor in the base sheet hid the panel outright above the old
   breakpoint. \`:not([hidden])\` both raises the specificity over it and says
   the thing that is true: the panel is hidden when it is closed, by the
   attribute, at every width. */
@media (min-width: 761px) and (max-width: 1080px) {
  .root :global(.site-menu:not([hidden])) { display: block; }
}
/* Whatever else is on the row, the promise is one line. */
.root :global(.header-cta),
.root :global(.site-menu-cta) { white-space: nowrap; }
@media (max-width: 900px) {
  /* Sign in has gone into the drawer by here, and with the nav gone too
     nothing was left to push the account controls to the right edge —
     space-between would have parked the button in the middle of the row. */
  .root :global(.site-header .header-cta) { margin-left: auto; }
}

/* -- the hero stops burying the product -------------------------------------

   Measured at 1280x720, which is the most common laptop viewport: the pipeline
   — the one piece of the page that shows the software doing something — began
   655px down and had 65 of its 281px above the fold. At 390x844 the hero alone
   ran 1574px and 41 of the pipeline's 622px were visible.

   Nothing is removed. The savings come from five places that were each a
   little generous: 155px of top padding over an 82px fixed header, a headline
   at 6.6vw, 24px under the eyebrow, 60px around the supporting line, and 46px
   above the stage. min-height goes because with all of that tightened it was
   the only thing still holding the band open. */
.root :global(.index-hero) {
  min-height: 0;
  padding-top: clamp(96px, 8.2vw, 124px);
  padding-bottom: 70px;
}
.root :global(.index-hero .eyebrow) { margin-bottom: 14px; }
.root :global(.index-hero h1) {
  max-width: 940px;
  font-size: clamp(38px, 4.4vw, 76px);
  line-height: 1.02;
  /* Proportional, because the base sheet's flat -5.4px was tuned for 100px and
     would have crushed the letterforms at 38. */
  letter-spacing: -.038em;
}
.root :global(.index-hero > p:not(.eyebrow)) {
  max-width: 700px;
  margin: 16px 0 22px;
  font-size: 16.5px;
}
.root :global(.index-hero .system-stage) { margin-top: 26px; }
@media (max-width: 760px) {
  .root :global(.index-hero) { padding-top: 92px; padding-bottom: 56px; }
  .root :global(.index-hero h1) { font-size: 40px; letter-spacing: -1.6px; }
  .root :global(.index-hero > p:not(.eyebrow)) { margin: 14px 0 20px; font-size: 15.5px; }
  .root :global(.index-hero .system-stage) { margin-top: 22px; }
}

/* -- the five cards show what they hand you ---------------------------------

   Each card was 300px tall carrying 235px of ink, and 48px of that was a hard
   \`margin-top\` under the number holding the card open. Body copy ran at 11px
   and the kicker at 8px, both under this sheet's own 12px floor for real copy.
   So: five attractive rectangles making five claims, on a page whose argument
   is that the parts connect.

   The list of three is what the feature produces, in the software's nouns. The
   card is no longer given a fixed height — its content sets it, and the link
   at the foot is pushed down by the column rather than pinned to the box, so
   adding a fourth line somewhere can never run underneath it. */
.root :global(.feature-link-grid a) {
  min-height: 0;
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
}
.root :global(.feature-link-grid a > span) { font-size: 10.5px; letter-spacing: .06em; }
.root :global(.feature-link-grid small) { margin-top: 11px; font-size: 9.5px; letter-spacing: 1.3px; }
.root :global(.feature-link-grid h3) { margin: 8px 0 0; font-size: 22px; letter-spacing: -.9px; }
.root :global(.feature-link-grid p) { margin: 8px 0 0; font-size: 13px; line-height: 1.5; }
.root :global(.feature-produces) {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin: 13px 0 0; padding: 0;
  list-style: none;
}
.root :global(.feature-produces li) {
  padding: 5px 10px;
  border: 1px solid rgba(174, 199, 211, .22);
  border-radius: 999px;
  background: rgba(255, 255, 255, .04);
  color: #d3dfe6;
  font-size: 12px; font-weight: 600; line-height: 1.3;
}
.root :global(.feature-link-grid a > b) {
  position: static;
  margin-top: auto;
  padding-top: 16px;
  font-size: 12.5px;
}
/* The base sheet drops the cards to one column here and re-asserts a height.
   THE HONEST TRADE, since it is measurable: three chips per card cost a phone
   about 45px each, and this hero gave back 196. The page is a little longer
   than it was and a great deal less empty; the padding below is what keeps
   "a little" true. */
@media (max-width: 760px) {
  .root :global(.feature-link-grid a),
  .root :global(.feature-link-grid a:nth-child(4)),
  .root :global(.feature-link-grid a:nth-child(5)) { min-height: 0; padding: 19px 18px 17px; }
  .root :global(.feature-link-grid p) { font-size: 12.5px; }
  .root :global(.feature-produces) { gap: 5px; margin-top: 11px; }
  .root :global(.feature-produces li) { padding: 4px 9px; }
  .root :global(.feature-link-grid a > b) { padding-top: 14px; }
}

/* ===========================================================================
   §99 — A BAND OF LIGHT CROSSING EACH SECTION
   ===========================================================================
   The homepage's seven bands each hold still. Every gradient on them is baked
   in place, so the only things that ever moved were four small objects inside
   the hero. This puts a slow specular sweep behind the content of each one —
   the sheen you get dragging a light across brushed metal, not a highlight
   racing past.

   HOW IT SITS. z-index: -1 with isolation: isolate on the section. That pair
   paints the sweep above the section's own background and below every line of
   its content, in one declaration, without touching a single content element
   to raise it — which is the alternative and would mean editing seven layouts.
   The sections that already isolate (.hero, .client-experience) are unchanged
   by it; the rest gain a stacking context that also stops the sweep escaping.

   HOW IT MOVES. transform on a blurred layer, so the blur is rasterised once
   and the compositor only moves the result. Nothing repaints per frame. Each
   band gets its own duration and a NEGATIVE delay, which starts it part-way
   through: without that, seven sections would begin in lockstep on load and
   the effect would read as a page-wide wipe instead of seven unrelated rooms
   with light in them.

   The travel is 380% of the sweep's own width. The sweep is 42% of its track
   and starts 68% to the left of it, so it has to cross 168% of the track —
   68 + 42 + 58 of clear run-out — before its trailing edge leaves. */
.root :global(.glare) {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  /* Not decoration a screen reader can reach, and not a click target. */
  user-select: none;
}
.root :global(.glare)::before,
.root :global(.glare)::after {
  content: "";
  position: absolute;
  top: -30%;
  bottom: -30%;
  left: -68%;
  width: 42%;
  will-change: transform;
  animation: lgqGlare 21s linear infinite;
  /* Paused until the observer says the section is on screen — six of the seven
     are not, at any given moment. */
  animation-play-state: paused;
}
.root :global(.glare[data-on="true"])::before,
.root :global(.glare[data-on="true"])::after { animation-play-state: running; }

/* The main sweep. */
.root :global(.glare)::before {
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(255, 255, 255, .022) 26%,
    rgba(255, 255, 255, .072) 50%,
    rgba(255, 255, 255, .022) 74%,
    transparent 100%
  );
  filter: blur(26px);
}
/* A second, narrower, warmer one at a different speed. Two bands at different
   rates read as depth; one reads as a wipe. */
.root :global(.glare)::after {
  width: 24%;
  left: -52%;
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(255, 178, 122, .05) 50%,
    transparent 100%
  );
  filter: blur(34px);
  animation-duration: 34s;
  animation-delay: -11s;
}

@keyframes lgqGlare {
  0%   { transform: translate3d(0, 0, 0) rotate(9deg); opacity: 0; }
  9%   { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translate3d(380%, 0, 0) rotate(9deg); opacity: 0; }
}

/* On cream, white is invisible and the same gesture has to be a shadow. */
.root :global(.glare[data-tone="cream"])::before {
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(90, 66, 44, .028) 26%,
    rgba(90, 66, 44, .075) 50%,
    rgba(90, 66, 44, .028) 74%,
    transparent 100%
  );
}
.root :global(.glare[data-tone="cream"])::after {
  background: linear-gradient(100deg, transparent 0%, rgba(255, 106, 36, .06) 50%, transparent 100%);
}
/* On the orange band the sweep can be brighter — it is competing with a
   saturated ground, not with a dark one. */
.root :global(.glare[data-tone="orange"])::before {
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(255, 255, 255, .05) 26%,
    rgba(255, 255, 255, .14) 50%,
    rgba(255, 255, 255, .05) 74%,
    transparent 100%
  );
}
.root :global(.glare[data-tone="orange"])::after {
  background: linear-gradient(100deg, transparent 0%, rgba(255, 226, 190, .1) 50%, transparent 100%);
}

/* Out of phase, section by section. */
.root :global(.hero) :global(.glare)::before { animation-duration: 27s; animation-delay: -4s; }
.root :global(.flagships) :global(.glare)::before { animation-duration: 19s; animation-delay: -13s; }
.root :global(.client-experience) :global(.glare)::before { animation-duration: 23s; animation-delay: -7s; }
.root :global(.included) :global(.glare)::before { animation-duration: 25s; animation-delay: -18s; }
.root :global(.pricing-band) :global(.glare)::before { animation-duration: 18s; animation-delay: -2s; }
.root :global(.home-faq-dark) :global(.glare)::before { animation-duration: 29s; animation-delay: -21s; }
.root :global(.final-cta) :global(.glare)::before { animation-duration: 20s; animation-delay: -9s; }

/* Four of the seven paint their background straight onto the section with no
   stacking context of their own, so a z-index:-1 child would slide underneath
   it and disappear. .hero and .client-experience already isolate. */
.root :global(.flagships),
.root :global(.included),
.root :global(.pricing-band),
.root :global(.home-faq-dark),
.root :global(.final-cta) { isolation: isolate; }
/* .home-faq has no position of its own; the rest are already relative. */
.root :global(.home-faq-dark) { position: relative; }

@media (prefers-reduced-motion: reduce) {
  /* Not "slower" — a light sweeping across the page is exactly the kind of
     ambient motion this preference is asking us not to run. */
  .root :global(.glare) { display: none; }
}

/* ===========================================================================
   §100 — ONE HEADER ACROSS THE PUBLIC SITE

   The marketing site was wearing three different headers. Clicking the same
   five nav links in order took a visitor through all of them:

     /  /features  /how-it-works   .site-header      82px, fixed, full bleed
     /for  /pricing                .public-topbar    70px, sticky, plus a
                                                     "See everything included"
                                                     button and a solid CTA
     /founder                      MarketingHeader   100px, static, a floating
                                                     rounded card, a DIFFERENT
                                                     logo, and a nav missing
                                                     both "For your trade" and
                                                     "Founder" while carrying
                                                     FAQ and Contact instead

   The fix is to draw the real one everywhere, which runs into the thing that
   made this hard in the first place: every rule that styles .site-header is
   scoped to .root, and .root is a full CSS reset — it strips margins off
   headings and paragraphs, list styling off ul/ol, and decoration off links.
   Wrapping /for or /founder in it would restyle the whole page.

   So .root wraps the HEADER ALONE. The reset reaches the eight elements
   inside the bar and stops, the custom properties (--orange, --ink, --muted)
   inherit into it as they do on a flagship page, and the page below keeps
   globals.css exactly as it had it. Nothing on .root establishes a stacking
   context, so the fixed header still positions against the viewport.

   Two things the wrapper has to fix up, both because .site-header changes
   position at 760px:

     - Above 760 it is position:fixed, which takes no space in flow. On a
       flagship page the hero's own top padding covers the 82px; these pages
       have no such padding, so the wrapper reserves the height itself.
     - At and below 760 it is sticky (it needs to be the containing block
       for the open drawer). Sticky travels only within its parent, and this
       parent is exactly one header tall — so the header would scroll away.
       The wrapper takes the stickiness instead, and the child's own sticky
       becomes a no-op inside it.

   Transparent because the wrapper is otherwise a bare 82px strip of .root's
   dark gradient sitting on pages with a warmer background. The fixed header
   covers it at rest, but it is uncovered for the length of a scroll.
   =========================================================================== */

/* Attribute rather than a second class: CSS modules rewrite class names, and
   an attribute selector passes through untouched, so this needs no :global. */
.root[data-chrome='slot'] {
  display: block;
  height: 82px;
  background: transparent;
}

@media (max-width: 760px) {
  .root[data-chrome='slot'] {
    height: auto;
    position: sticky;
    top: 0;
    z-index: 40;
  }
}

/* ===========================================================================
   §101 — TWO SITE-WIDE FIXES THAT ARRIVED WITH /HOW-IT-WORKS
   ===========================================================================
   The rest of this section styled the five-stage version of that page. That
   page is gone — §105 is what replaced it — and so is the CSS for it. These
   two rules outlived it because neither was ever scoped to the page.

   1. THE 12px FLOOR. 63 elements of real copy on /how-it-works rendered
      between 9.5px and 11.5px on a phone. Two of the selectors in that list
      are on every page rather than that one: the closing band's kicker and the
      footer copyright. Both are single lines in their own row, so there is
      nothing for the extra pixel to disturb. */
.root :global(.final-cta .eyebrow),
.root :global(footer > span) { font-size: 12px; }

/* ---- 2. one signup button at a time --------------------------------------

   Opening the menu on a phone put two orange "Build my free site" buttons on
   screen at once — the header's, still sitting in the bar, and the drawer's,
   which is the whole reason the drawer has one. Below the nav breakpoint the
   drawer is where the offer lives, so the bar's copy of it stands down while
   the panel is open.

   Site-wide rather than page-scoped: [data-menu="open"] is only ever set below
   1080px, which is exactly where the drawer exists. And the bottom bar goes
   with it — a fixed bar over an open panel is a third copy of the same button
   and it covers the last row of the panel. */
.root :global(.site-header[data-menu="open"] .header-cta) { display: none; }
.root :global(.site-header[data-menu="open"] ~ .mobile-cta) { display: none; }

/* ===========================================================================
   §102 — THE TRADE ORBIT

   Five tool renders circling the hero copy, one lap every 68 seconds. The
   homepage's first screen said "Run your contracting business" in words and
   nothing else in it said whose business.

   Positions come from the component (src/components/flagship/trade-orbit.tsx),
   which writes transform and opacity per frame; the geometry and the fade rule
   are in src/lib/trade-orbit.ts, where they are tested. Everything here is the
   part that does not move.
   =========================================================================== */

/* z-index: -1 is the entire z-order answer, and it is why nothing in the hero
   copy had to be touched. .hero already declares isolation: isolate (§99 gave
   it that for the glare), so a negative-z child paints ABOVE the section's
   gradient and BELOW every in-flow element — headline, sub, both buttons, the
   proof line and the product frame. An object crossing the right side slides
   under the screenshot and comes back out. */
.root :global(.trade-orbit) {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  /* Set by the component on measure; the fallback keeps the served HTML sane
     if the effect never runs. */
  --orbit-scale: 1;
  /* Nothing is seen until the first measurement lands — otherwise five objects
     paint stacked at the origin for a frame. */
  opacity: 0;
  transition: opacity .6s ease;
}
.root :global(.trade-orbit[data-ready="true"]) { opacity: 1; }

.root :global(.trade-orbit-item) {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: calc(var(--w) * var(--orbit-scale) * 1px);
  height: calc(var(--h) * var(--orbit-scale) * 1px);
  /* Constant. The objects used to fade as they crossed the headline and the
     buttons; they hold their strength now and simply pass underneath. */
  opacity: .92;
  /* Composited, and the only property the loop writes. */
  will-change: transform;
  /* drop-shadow and not box-shadow: these are cut-outs, and only drop-shadow
     follows the alpha channel rather than the element's box. */
  filter: drop-shadow(0 18px 26px rgba(0, 0, 0, .55));
}
.root :global(.trade-orbit-item img) { display: block; width: 100%; height: 100%; }

/* The path, drawn. Sized and placed by the component. */
.root :global(.trade-orbit-ring) {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px solid rgba(255, 101, 29, .15);
  border-radius: 50%;
}

/* THE ORBIT RUNS AT EVERY WIDTH, phones included. It used to stop at 1100 —
   where .hero-split goes to one column — because the objects had to stay clear
   of the copy and there was no margin left to do it in. They pass behind the
   copy now, so the constraint is gone: the component measures the stacked hero
   and aims the right arc just past the copy's edge instead of at a gutter that
   is not there.

/* Reduced motion keeps the objects and loses the movement. The component
   places them once and never starts the loop; this stops the reveal fading in
   as well, so the hero simply has five tools in it. */
@media (prefers-reduced-motion: reduce) {
  .root :global(.trade-orbit) { transition: none; }
  .root :global(.trade-orbit-item) { will-change: auto; }
}

/* ===========================================================================
   §103 — THE 1-2-3 WHEEL BECOMES A VERTICAL STEPPER

   It was a 104px ring carrying three numbered nodes, counter-rotating so the
   current one came to the top, with the count in the middle. Two rounds of
   measurement went into fitting that circle into .scrolly-layout's gutter —
   clamp(40px, 6vw, 100px), which is 66px at 1101px — and it never really fit:
   the notes above record it overlapping the product frame by 31-33px and
   covering the left edge of "Generate full site with AI" and two streets of the
   route map.

   A wheel is the right shape for something cyclical, and these three are not
   cyclical. They are one, then two, then three, read by scrolling DOWN them. A
   vertical rail runs the same direction as the reading, is 46px wide instead of
   124px so the gutter problem stops existing, and can say something the wheel
   could not: which steps you have already passed.
   =========================================================================== */

/* Zero-tall and sticky, as the first child of .steps-column — which spans the
   whole tour in BOTH layouts, which is the entire point. Inside .sticky-product
   it worked on a desktop by accident: that panel is sticky above 1100px and
   static below, so on a phone the rail sat in a block positioned after all
   three steps and scrolled past the reader once.

   height:0 keeps it out of the column's flow, so it cannot push a card down,
   and the list hangs off it. top:50vh puts the pinned line at the middle of the
   screen, which is where the wheel's centre used to sit. */
.root :global(.step-rail) {
  position: sticky;
  top: 50vh;
  height: 0;
  z-index: 3;
}
.root :global(.step-rail ol) {
  position: absolute;
  /* Just outside the copy column, in .scrolly-layout's gutter. */
  left: 100%;
  margin-left: 16px;
  top: 0;
  transform: translateY(-50%);
  display: grid;
  gap: 34px;                       /* the connector lives in this gap */
  margin-block: 0;
  padding: 0;
  list-style: none;
}
.root :global(.step-rail li) { position: relative; margin: 0; }

/* The connector, drawn in the gap above each node but the first. A pseudo
   element on the LI rather than a border on the button: the button is a circle
   and a border would follow its radius. */
.root :global(.step-rail li + li)::before {
  content: "";
  position: absolute;
  left: 50%;
  top: -34px;
  width: 2px;
  height: 34px;
  margin-left: -1px;
  border-radius: 2px;
  background: rgba(174, 199, 211, .2);
  transition: background .3s ease;
}
/* A segment behind you is lit; the one you are on and the ones ahead are not.
   The state is on the LI, so the segment above a node reads the node it leads
   INTO — which is the one that has been reached. */
.root :global(.step-rail li[data-state="done"])::before,
.root :global(.step-rail li[data-state="current"])::before { background: var(--orange); }

.root :global(.step-rail button) {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid rgba(174, 199, 211, .26);
  background: rgba(7, 19, 29, .82);
  backdrop-filter: blur(8px);
  color: #8ea2b0;
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px;
  letter-spacing: .04em;
  cursor: pointer;
  transition: color .22s ease, border-color .22s ease, background .22s ease, transform .22s ease;
}
.root :global(.step-rail button:hover) {
  color: #e6eef2;
  border-color: rgba(255, 106, 36, .55);
  transform: translateY(-1px);
}

/* Passed: solid enough to read as complete, quiet enough not to compete with
   the one you are on. */
.root :global(.step-rail li[data-state="done"] button) {
  border-color: rgba(255, 106, 36, .45);
  color: #ff9257;
}
/* Current: the only filled node on the rail. */
.root :global(.step-rail li[data-state="current"] button) {
  border-color: var(--orange);
  background: var(--orange);
  color: var(--ink-on-orange);
  font-weight: 700;
  box-shadow: 0 0 0 5px rgba(255, 106, 36, .12), 0 14px 30px rgba(0, 0, 0, .42);
}

/* The name is for assistive tech and for a wider rail; at this width the
   numbers carry it and each button already has an aria-label naming the step. */
.root :global(.step-rail-name) {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* The gutter closes below the two-column tour. Same answer the wheel used:
   the top-right of the stage, clear of both columns — but vertical, and
   smaller, so three nodes still fit above the fold of the panel. */
/* One column below here, so there is no gutter to sit in — the rail goes to the
   right edge of the column instead, which on a phone is the edge of the screen
   and clear of the card's own padding. Still sticky: the whole reason this
   moved. */
@media (max-width: 1100px) {
  .root :global(.step-rail ol) {
    left: auto;
    right: 0;
    margin-left: 0;
    margin-right: -6px;
    gap: 22px;
  }
  /* The rail floats over the right edge of these cards now, so the copy stops
     short of it. Measured at 390 before this: the node sat on "clear project
     summary" in step 02's paragraph. */
  .root :global(.feature-step) { padding-right: 54px; }
  .root :global(.step-rail li + li)::before { top: -22px; height: 22px; }
  .root :global(.step-rail button) { width: 34px; height: 34px; font-size: 10.5px; }
  .root :global(.step-rail li[data-state="current"] button) { box-shadow: 0 0 0 4px rgba(255, 106, 36, .12); }
}

@media (prefers-reduced-motion: reduce) {
  .root :global(.step-rail button),
  .root :global(.step-rail li + li)::before { transition: none; }
  .root :global(.step-rail button:hover) { transform: none; }
}

/* ---- the pricing band lost its calculator ---------------------------------

   A slider that worked out a year's fee sat above these buttons. With it gone
   the band needs somewhere to send the visitor who wanted that number, so the
   single primary button became a pair — and a pair needs a row. */
.root :global(.pricing-actions) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
}
@media (max-width: 620px) {
  .root :global(.pricing-actions) { display: grid; }
  .root :global(.pricing-actions .button) { justify-content: center; }
}

/* ===========================================================================
   §104 — /FEATURES: THE THREAD BESIDE THE COPY

   The hero carried a five-card strip — WEBSITE, INTAKE, QUOTE, SCHEDULE,
   PAYMENT — under the copy, tilted, with two notification cards floating over
   it. Three things were wrong with it and only one was taste:

     1. The cards COLLIDED. .floating-alert sat at a fixed \`top: 8px;
        right: -18px\` and covered stage 05, so a five-step story hid its fifth
        step; .floating-paid at \`bottom: 42px; left: -20px\` covered the job
        record, and "Kitchen lighting upgrade" rendered as "...ograde".
     2. Five equal boxes make five equal claims and none of them is large
        enough to read as software. It was a process diagram.
     3. It sat UNDER the copy, so the hero had to be tall enough for both.

   Beside the copy instead, the band gets its height from whichever column is
   taller rather than from their sum, and the thread has room to run at a size
   where the actual words of a text are legible.

   NO WRAPPER DIV. .index-hero > h1 and .index-hero > p:not(.eyebrow) are
   load-bearing child selectors in the ported sheet (and again in the tweak that
   tightened this hero), so wrapping the copy in a column div would silently
   drop the headline scale and the supporting line's measure. Everything is
   placed explicitly in the grid instead.

   The 1fr rows top and bottom are what centre the copy against the thread: the
   four content rows size to their content and the slack splits evenly, which a
   plain \`align-items: center\` cannot do when one item spans every row.

   Scoped to .index-hero-beside, because /features-flagship renders the ported
   .index-hero unchanged and is the reference this page is measured against. */
/* THE GUTTER IS THE PAGE'S, NOT THE BAND'S. .index-hero pads 24px where every
   section under it pads clamp(24px, 6vw, 104px), which a centred hero hid.
   Left-aligned it stops hiding: fixed 580/505 tracks measured 222..1378 at
   1600 against the feature grid's 96..1504, and at 1101 the tracks outgrew the
   gutter and ran to 24px while the grid below started at 66. Fractional tracks
   inside the page's own gutter line the headline up with the section beneath
   it at every width. */
.root :global(.index-hero-beside) {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  grid-template-rows: 1fr auto auto auto auto 1fr;
  column-gap: clamp(30px, 4.4vw, 74px);
  padding: clamp(92px, 7.4vw, 120px) clamp(24px, 6vw, 104px) 68px;
  text-align: left;
}
.root :global(.index-hero-beside > .eyebrow) { grid-column: 1; grid-row: 2; }
.root :global(.index-hero-beside > h1) {
  grid-column: 1;
  grid-row: 3;
  /* Was clamp(38px, 4.4vw, 76px) across the full band. In a 580px column that
     ran seven lines at 1440 and pushed the copy past the thread. */
  font-size: clamp(33px, 3.15vw, 50px);
  letter-spacing: -.032em;
  line-height: 1.04;
}
.root :global(.index-hero-beside > p:not(.eyebrow)) {
  grid-column: 1;
  grid-row: 4;
  margin: 18px 0 0;
  font-size: 16px;
  line-height: 1.62;
}
.root :global(.index-hero-beside > .hero-actions) { grid-column: 1; grid-row: 5; margin-top: 26px; }
.root :global(.index-hero-beside > .hero-thread) { grid-column: 2; grid-row: 1 / -1; align-self: center; }

/* ---- the thread itself ---- */

.root :global(.hero-thread) {
  width: 100%;
  padding: 15px 17px 17px;
  border: 1px solid #24404e;
  border-radius: 17px;
  background: linear-gradient(180deg, rgba(17, 38, 50, .96), rgba(10, 26, 36, .96));
  box-shadow:
    0 2px 0 rgba(255, 255, 255, .04) inset,
    0 26px 58px rgba(0, 0, 0, .42);
}
.root :global(.hero-thread-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 13px;
  border-bottom: 1px solid #1e3743;
  font-size: 12px;
  font-weight: 700;
  color: #dbe6ea;
}
.root :global(.hero-thread-head) i {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--mint);
}
.root :global(.hero-thread-head) small {
  font-family: var(--font-geist-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #7d95a2;
}

.root :global(.hero-thread-rows) {
  list-style: none;
  margin: 0;
  padding: 15px 0 0;
  display: grid;
  gap: 13px;
}

/* An event is the software acting. No bubble, because nobody typed it. */
.root :global(.ht-event) {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: #9db0bd;
}
/* nowrap and a track wide enough for the longest of them: at 390 a 46px track
   broke "10:02 AM" over two lines and pushed its row 12px taller than the one
   above it, which is visible when the two events bracket the thread. */
.root :global(.ht-event) time {
  font-family: var(--font-geist-mono);
  font-size: 9.5px;
  letter-spacing: .04em;
  color: #6d8593;
  white-space: nowrap;
}
.root :global(.ht-event) span {
  position: relative;
  padding-left: 15px;
}
.root :global(.ht-event) span::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-top: -3px;
  border-radius: 50%;
  background: #3d5b69;
}
.root :global(.ht-paid) span { color: #cfe7de; }
.root :global(.ht-paid) span::before {
  background: var(--mint);
  box-shadow: 0 0 0 3px rgba(80, 227, 189, .14);
}

/* The lead record, not a message — so it is a card, not a bubble. */
.root :global(.ht-intake) {
  border: 1px solid rgba(255, 215, 107, .22);
  border-radius: 13px;
  background: rgba(255, 215, 107, .05);
  padding: 12px 13px 13px;
}
.root :global(.ht-kicker) {
  font-family: var(--font-geist-mono);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--yellow);
}
.root :global(.ht-intake) p {
  margin: 9px 0 0;
  /* A measure, not a width. Stacked, the panel is 720px and this ran 88
     characters a line — the app caps its own message text at 74ch for the
     same reason. */
  max-width: 33rem;
  font-size: 12.5px;
  line-height: 1.55;
  color: #d5e1e6;
}
.root :global(.ht-signals) {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 11px;
}
.root :global(.ht-signals) > span {
  border: 1px solid #2b4553;
  border-radius: 9px;
  padding: 7px 9px;
  background: rgba(255, 255, 255, .02);
}
.root :global(.ht-signals) small {
  display: block;
  font-family: var(--font-geist-mono);
  font-size: 8px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: #7d95a2;
}
.root :global(.ht-signals) b { display: block; margin-top: 4px; font-size: 11.5px; }

/* The messages. Same two shapes as the app's own inbox — inbound left with the
   near corner squared off, outbound right on the deeper orange, which is a
   gradient rather than the brand hue because #ff6a24 carries white at 2.4:1
   and this runs 4.9:1. A hero is exactly where that gets read outdoors. */
.root :global(.ht-msg) { display: grid; gap: 5px; }
.root :global(.ht-msg) p {
  margin: 0;
  padding: 10px 13px;
  border-radius: 15px;
  font-size: 12.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.root :global(.ht-msg) time {
  font-family: var(--font-geist-mono);
  font-size: 9px;
  color: #6d8593;
}
.root :global(.ht-out) { justify-items: end; }
.root :global(.ht-out) p {
  /* Two caps: a percentage so the bubble never fills its side of the thread,
     and a length so it stops growing when the panel goes full-width stacked. A
     message that runs 85 characters a line has stopped looking like one. */
  max-width: min(94%, 30rem);
  /* The app's sent-message blue, not the brand orange — see the note on
     .inbox-bubble-outbound in globals.css. This is the same text a customer
     receives, so it has to be the same bubble. */
  background: linear-gradient(246deg, #0061af, #1f3b4d);
  border: 1px solid rgba(255, 255, 255, .09);
  border-bottom-right-radius: 6px;
  color: #fff;
}
.root :global(.ht-in) { justify-items: start; }
.root :global(.ht-in) p {
  max-width: min(88%, 30rem);
  background: #17313d;
  border: 1px solid #26424f;
  border-bottom-left-radius: 6px;
  color: #e2edf1;
}

/* A rule above it, mirroring the one under the head — without it the link sat
   directly under the last event and read as a seventh row of the thread. */
.root :global(.hero-thread-demo) {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid #1e3743;
  font-size: 11.5px;
  font-weight: 750;
  letter-spacing: .01em;
  color: #9db0bd;
  transition: color .18s ease;
}
.root :global(.hero-thread-demo):hover { color: var(--orange); }

/* Below the two-column band the thread rejoins the flow under the copy.

   EVERY PLACEMENT IS UNDONE BY THE SELECTOR THAT SET IT, not by a shorter one.
   A tidy \`.index-hero-beside > *\` is (0,2,0) and loses to \`> .hero-thread\`
   at (0,3,0) and \`> h1\` at (0,2,1), so the thread stayed in column 2 and the
   headline in row 3 while the container had one column — measured at 1040 as a
   394px copy column beside a 551px implicit one, with the h1 90px wide at 390.
   Matching the specificity is what makes the reset actually reset. */
@media (max-width: 1040px) {
  .root :global(.index-hero-beside) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    row-gap: 0;
  }
  .root :global(.index-hero-beside > .eyebrow),
  .root :global(.index-hero-beside > h1),
  .root :global(.index-hero-beside > p:not(.eyebrow)),
  .root :global(.index-hero-beside > .hero-actions),
  .root :global(.index-hero-beside > .hero-thread) { grid-column: 1; grid-row: auto; }
  .root :global(.index-hero-beside > h1) { font-size: clamp(34px, 5.4vw, 48px); }
  /* Left-aligned in a full-width column rather than centred in a fixed one, so
     its left edge stays on the headline's. */
  .root :global(.index-hero-beside > .hero-thread) {
    margin-top: 30px;
    align-self: stretch;
    max-width: 720px;
  }
}

@media (max-width: 760px) {
  /* The sections below this one drop to a flat 20px here. */
  .root :global(.index-hero-beside) { padding-left: 20px; padding-right: 20px; }
}

@media (max-width: 560px) {
  .root :global(.hero-thread) { padding: 13px 13px 15px; }
  .root :global(.ht-event) { font-size: 11px; }
  .root :global(.ht-out) p, .root :global(.ht-in) p { max-width: 100%; }
}
/* ===========================================================================
   §105 — /HOW-IT-WORKS IS A LEAD QUEUE, NOT A MANUAL

   The page it replaces was five numbered stages explaining the product from
   the beginning. It explained thoroughly and converted slowly: 7,403px on a
   desktop, 10,537px on a phone, and the thing a contractor actually wants to
   know — which of today's requests is worth stopping for — was never on the
   first screen.

   THE MATERIAL. Everything the product decides is printed on paper: a cream
   receipt with a torn bottom edge, on a deep navy ground. That is not
   decoration. A receipt is a record of a decision already made, with its
   reasons itemised, and it is exactly what an estimate, a score and a distance
   are. The three opportunity cards, the hero, the qualification panel and the
   closing stamp are all the same object seen five times.

   THE PALETTE. Navy #061a23 ground, two lighter navies for raised surfaces,
   cream paper, and construction orange #ff5f22 held back for one thing at a
   time: the action, the stamp, the current section. Green is the tick on a
   satisfied condition and never means "accent". Yellow belongs to Quick Stops
   alone, because a paid priority visit is a different kind of thing from a
   lead and the page should not have to say so twice.

   WHAT THE PAGE MAY CLAIM. Nothing here is bought, sold or supplied: every
   request arrives at the contractor's own site, and the product qualifies,
   estimates, scores, ranks and surfaces it. The CSS enforces nothing, but the
   drawing has to agree with the words — which is why the tickets look like the
   contractor's own paperwork and not like a marketplace listing.
   =========================================================================== */

.root:global(.hiq-page) {
  --hiq-navy: #061a23;
  --hiq-navy-2: #0c2731;
  --hiq-navy-3: #12323d;
  --hiq-paper: #f3efe7;
  --hiq-paper-2: #fffaf1;
  --hiq-ink: #122229;
  --hiq-orange: #ff5f22;
  --hiq-orange-dark: #c94212;
  --hiq-green: #2b9e61;
  --hiq-muted: #a8bdc5;
  --hiq-line: rgba(174, 205, 216, .17);
  --hiq-line-bright: rgba(185, 220, 230, .3);
  /* Which paper this receipt is printed on. The torn edge has to be cut out of
     the SAME colour as the card above it, so every card sets this and the tear
     reads it rather than hard-coding cream. */
  --hiq-tear: var(--hiq-paper);

  background: var(--hiq-navy);
  color: #f8f4ed;
  /* The bands below are full-bleed and several of them glow past their own
     edges. Clipped rather than hidden, so nothing here becomes a scroll
     container for the sticky nav inside it. */
  overflow-x: clip;
}

.root :global(.hiq-shell) {
  max-width: 1220px;
  margin: 0 auto;
  padding-inline: clamp(20px, 4vw, 32px);
}

/* ---- the shared furniture ------------------------------------------------ */

.root :global(.hiq-eyebrow) {
  margin: 0 0 20px;
  color: #ff7840;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .17em;
  text-transform: uppercase;
}
/* On paper and peach the same orange is unreadable at 12px. */
.root :global(.hiq-eyebrow-dark) { color: var(--hiq-orange-dark); }

.root :global(.hiq-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 49px;
  padding: 0 20px;
  border: 1px solid var(--hiq-orange);
  border-radius: 9px;
  background: var(--hiq-orange);
  color: #20100a;
  font-size: 14px;
  font-weight: 650;
  box-shadow: 0 10px 24px rgba(255, 95, 34, .18), inset 0 1px rgba(255, 255, 255, .32);
  transition: background .15s ease, box-shadow .15s ease, transform .15s ease;
}
.root :global(.hiq-button:hover) {
  background: #ff7542;
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(255, 95, 34, .27), inset 0 1px rgba(255, 255, 255, .38);
}
.root :global(.hiq-button span) { margin-left: 8px; }

.root :global(.hiq-textlink) {
  color: #ff7c49;
  font-size: 14px;
  font-weight: 600;
  text-underline-offset: 4px;
}
.root :global(.hiq-textlink:hover) { text-decoration: underline; }

.root :global(.hiq-actions) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 32px;
}

/* The section heading, and the sentence that qualifies it. Two columns on a
   desktop because the qualifying sentence is support, not a subtitle — under
   a 60px heading it reads as one more thing to get through. */
.root :global(.hiq-split) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(310px, .65fr);
  align-items: end;
  gap: 60px;
  margin-bottom: 50px;
}
.root :global(.hiq-split h2) {
  margin: 0;
  font-size: clamp(34px, 4.6vw, 60px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -.05em;
  text-wrap: balance;
}
.root :global(.hiq-split > p) {
  margin: 0;
  font-size: 17px;
  line-height: 1.65;
}
.root :global(.hiq-opps .hiq-split > p) { color: #546469; }
.root :global(.hiq-split-bridge > p) { color: var(--hiq-muted); }
.root :global(.hiq-split-bridge h2) { color: #f7f3ec; font-size: clamp(32px, 4.5vw, 58px); }

.root :global(.hiq-example) {
  margin: 24px 0 0;
  color: #7b8587;
  font-size: 12px;
  text-align: right;
}

/* ---- the page's own three stops ------------------------------------------

   The SITE navigation is the header's and it is untouched on this page. This
   is the page's, and it exists so the header never has to grow a second,
   page-specific set of links. 82px is the fixed header's height; §101's
   predecessor learned the hard way that a sticky bar with no top offset parks
   itself on top of the brand and the signup button. */
.root :global(.hiq-nav) {
  position: sticky;
  top: 82px;
  z-index: 15;
  border-bottom: 1px solid var(--hiq-line);
  background: rgba(9, 32, 41, .84);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.root :global(.hiq-nav ol) {
  display: flex;
  gap: clamp(18px, 3vw, 34px);
  max-width: 1220px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 32px);
  list-style: none;
}
.root :global(.hiq-nav a) {
  display: block;
  padding: 14px 0;
  white-space: nowrap;
  color: #9fb5be;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: .06em;
  text-transform: uppercase;
  border-bottom: 2px solid transparent;
  transition: color .18s ease, border-color .18s ease;
}
.root :global(.hiq-nav a:hover) { color: #f2f7f8; }
.root :global(.hiq-nav a[aria-current="true"]) {
  color: #ffd0bb;
  border-bottom-color: var(--hiq-orange);
}

/* ---- the hero ------------------------------------------------------------ */

.root :global(.hiq-hero) {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(420px, 1.1fr);
  align-items: center;
  gap: clamp(48px, 6vw, 82px);
  max-width: 1220px;
  margin: 0 auto;
  padding: clamp(56px, 6vw, 86px) clamp(20px, 4vw, 32px) clamp(64px, 7vw, 92px);
  scroll-margin-top: 140px;
}

/* THE SLOW GLARE. Two soft lights drifting behind the copy on a thirteen
   second cycle, and a single sheet of light lying across the whole band. Both
   sit behind the content on their own z-indexes and neither takes pointer
   events, so nothing here can catch a click meant for the receipt. */
.root :global(.hiq-hero)::before {
  content: "";
  position: absolute;
  inset: -80px -14vw -40px;
  z-index: -2;
  pointer-events: none;
  filter: blur(10px);
  background:
    radial-gradient(circle at 72% 34%, rgba(255, 95, 34, .2), transparent 25%),
    radial-gradient(circle at 23% 58%, rgba(69, 148, 165, .15), transparent 30%);
  animation: hiqAmbient 13s ease-in-out infinite alternate;
}
.root :global(.hiq-hero)::after {
  content: "";
  position: absolute;
  inset: 0 -25%;
  z-index: -1;
  pointer-events: none;
  transform: translateX(-18%);
  background: linear-gradient(108deg, transparent 32%, rgba(255, 255, 255, .043) 48%, transparent 63%);
}

@keyframes hiqAmbient {
  0% { opacity: .72; transform: translate(-2%, -1%) scale(.98); }
  100% { opacity: 1; transform: translate(3%, 2%) scale(1.06); }
}

.root :global(.hiq-hero h1) {
  margin: 0;
  font-size: clamp(40px, 5.5vw, 72px);
  font-weight: 400;
  line-height: .99;
  letter-spacing: -.055em;
  text-wrap: balance;
}
.root :global(.hiq-hero h1 em) { display: block; color: var(--hiq-orange); font-style: normal; }
.root :global(.hiq-lede) {
  max-width: 560px;
  margin: 27px 0 0;
  color: #b3c7ce;
  font-size: 18px;
  line-height: 1.65;
}

.root :global(.hiq-hero-receipt) { display: flex; justify-content: center; padding: 20px 4px 30px; }

/* ---- the receipt --------------------------------------------------------- */

.root :global(.hiq-receipt) {
  position: relative;
  border: 1px solid rgba(255, 255, 255, .76);
  border-radius: 8px 8px 2px 2px;
  background: var(--hiq-tear);
  color: var(--hiq-ink);
  box-shadow: 0 30px 70px rgba(0, 0, 0, .3), 0 0 0 1px rgba(5, 25, 33, .13), inset 0 1px rgba(255, 255, 255, .82);
}
/* The hairline printed INSIDE the paper, the way a real docket has one. Open
   at the bottom, because the bottom is torn off. */
.root :global(.hiq-receipt)::before {
  content: "";
  position: absolute;
  inset: 7px 7px 0;
  pointer-events: none;
  border: 1px solid rgba(102, 82, 60, .09);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
}
/* THE TEAR. A row of triangles cut out of the card's own colour and hung
   below its bottom edge, so the paper ends in a serrated line instead of a
   border. Sized in one place: 15px teeth on a 15px tile. */
.root :global(.hiq-receipt)::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -14px;
  left: 0;
  height: 15px;
  background: linear-gradient(135deg, transparent 7px, var(--hiq-tear) 0) repeat-x 0 0 / 15px 15px;
}

.root :global(.hiq-receipt-head) {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 21px;
  border-bottom: 1px dashed #c8c0b6;
}
.root :global(.hiq-receipt-head h3) {
  margin: 0;
  font-size: clamp(24px, 2.4vw, 29px);
  font-weight: 700;
  letter-spacing: -.035em;
}
.root :global(.hiq-receipt-head span) {
  color: #5c6a6e;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

/* SET AT READING SIZE, NOT CAPTION SIZE.
   The receipt IS the argument of this page — four lines saying why a request
   is worth stopping for — and it was printed at 14px label / 12px value in a
   470px card, which left a third of the paper empty and made the one thing
   the reader is meant to study the faintest thing on the screen. The label is
   now body copy and the value is the weight of a stamped figure. */
.root :global(.hiq-receipt-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 74px;
  border-bottom: 1px solid #cfc7bc;
  font-size: clamp(16px, 1.5vw, 18px);
  font-weight: 500;
}
/* Green is "this condition is satisfied", not "good news". Every value in
   this column is a check the request passed. Darkened from #2b9e61, which
   carried 3.1:1 on cream — under the bar for text this small before it was
   made this large, and comfortably over it now at 4.9:1. */
.root :global(.hiq-receipt-row strong) {
  color: #1c7a49;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: clamp(13px, 1.25vw, 15px);
  font-weight: 700;
  letter-spacing: .01em;
  text-align: right;
}

.root :global(.hiq-receipt-total) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-top: 31px;
}
.root :global(.hiq-receipt-total > strong) {
  font-size: clamp(28px, 3.4vw, 34px);
  font-weight: 550;
  letter-spacing: -.04em;
  font-variant-numeric: tabular-nums;
}

.root :global(.hiq-stamp) {
  border: 3px solid var(--hiq-orange);
  padding: 8px 10px;
  color: var(--hiq-orange-dark);
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .13em;
  transform: rotate(-4deg);
}
/* With no total beside it the stamp has nothing to sit against, so it hangs
   off the right edge of the paper the way one gets banged on by hand. */
.root :global(.hiq-stamp-solo) { display: table; margin: 30px 0 0 auto; font-size: 16px; }

.root :global(.hiq-receipt-hero) {
  width: 100%;
  max-width: 470px;
  padding: 40px 34px 42px;
  transform: rotate(1.5deg);
}
.root :global(.hiq-receipt-why) { padding: 35px 32px 45px; transform: rotate(-1deg); }

/* ---- the fact rail ------------------------------------------------------- */

.root :global(.hiq-facts) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--hiq-line);
  border-bottom: 1px solid var(--hiq-line);
  background: linear-gradient(90deg, rgba(13, 43, 54, .78), rgba(18, 51, 62, .48), rgba(13, 43, 54, .78));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: inset 0 1px rgba(255, 255, 255, .024), inset 0 -1px rgba(0, 0, 0, .18);
}
.root :global(.hiq-facts > div) {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 27px 18px;
}
.root :global(.hiq-facts > div + div) { border-left: 1px solid var(--hiq-line); }
.root :global(.hiq-facts strong) { font-size: 24px; font-weight: 600; }
.root :global(.hiq-facts span) {
  color: #8fa7b1;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

/* ---- the opportunities --------------------------------------------------- */

.root :global(.hiq-opps) {
  padding: clamp(72px, 8vw, 112px) 0 clamp(80px, 9vw, 122px);
  background:
    radial-gradient(circle at 14% 16%, rgba(255, 255, 255, .82), transparent 27%),
    radial-gradient(circle at 86% 74%, rgba(255, 146, 88, .11), transparent 30%),
    var(--hiq-paper);
  color: var(--hiq-ink);
  scroll-margin-top: 140px;
}

.root :global(.hiq-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.root :global(.hiq-ticket) {
  --hiq-tear: var(--hiq-paper-2);
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 25px 23px 29px;
  border: 1px solid rgba(116, 94, 72, .22);
  border-radius: 14px 14px 2px 2px;
  background: var(--hiq-paper-2);
  box-shadow: 0 20px 45px rgba(63, 42, 28, .1), inset 0 0 0 1px rgba(255, 255, 255, .7), inset 0 1px rgba(255, 255, 255, .95);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.root :global(.hiq-ticket):hover {
  transform: translateY(-5px);
  border-color: rgba(255, 95, 34, .42);
  box-shadow: 0 28px 60px rgba(63, 42, 28, .15), inset 0 0 0 1px rgba(255, 255, 255, .82), inset 0 1px rgba(255, 255, 255, .95);
}
/* Same tear as the receipts, cut from the ticket's slightly whiter paper. */
.root :global(.hiq-ticket)::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -14px;
  left: 0;
  height: 15px;
  background: linear-gradient(135deg, transparent 7px, var(--hiq-tear) 0) repeat-x 0 0 / 15px 15px;
}

/* A paid priority visit is not a lead, and the card says so before a word is
   read: hazard tape along the top edge and a warm yellow surround. Restrained
   on purpose — orange is still the page's action colour and this must not
   compete with the button inside the card. */
.root :global(.hiq-ticket[data-kind="quick"]) {
  border-color: #e8b348;
  box-shadow: 0 0 0 2px rgba(232, 179, 72, .16), 0 22px 48px rgba(63, 42, 28, .11), inset 0 1px rgba(255, 255, 255, .92);
}
.root :global(.hiq-ticket[data-kind="quick"])::before {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 7px;
  background: repeating-linear-gradient(-45deg, #edb33b 0 6px, transparent 6px 12px);
}
.root :global(.hiq-ticket[data-kind="followup"]) {
  border-color: #9dbfc3;
  box-shadow: 0 0 0 2px rgba(94, 145, 153, .09), 0 22px 48px rgba(63, 42, 28, .1), inset 0 1px rgba(255, 255, 255, .92);
}

.root :global(.hiq-ticket-top) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 28px;
}
.root :global(.hiq-badge) {
  border: 2px solid var(--hiq-orange);
  padding: 7px 8px;
  color: var(--hiq-orange-dark);
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  transform: rotate(-2deg);
}
.root :global(.hiq-ticket[data-kind="quick"] .hiq-badge) {
  border-color: #f2bb45;
  background: #f2bb45;
  color: #2c220d;
}
.root :global(.hiq-ticket[data-kind="followup"] .hiq-badge) { border-color: #4d7e84; color: #315e64; }
.root :global(.hiq-ticket-time) { color: #7d8889; font-size: 11px; }

.root :global(.hiq-value-label) { display: block; margin-bottom: 3px; color: #7d8889; font-size: 11px; }
.root :global(.hiq-value) {
  font-size: 42px;
  font-weight: 450;
  line-height: 1;
  letter-spacing: -.045em;
  font-variant-numeric: tabular-nums;
}
.root :global(.hiq-ticket h3) {
  margin: 18px 0 10px;
  font-size: 21px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -.025em;
}
.root :global(.hiq-location) { margin: 0; color: #657174; font-size: 13px; }

.root :global(.hiq-reasons) {
  display: grid;
  gap: 10px;
  margin: 21px 0 0;
  padding: 19px 0 0;
  border-top: 1px dashed #cdc5ba;
  list-style: none;
}
.root :global(.hiq-reasons li) { color: #526064; font-size: 13px; }
/* The mark carries the card's own colour, so the three cards are legible as
   three different KINDS of thing at a glance rather than three prices. */
.root :global(.hiq-reasons li span) { color: var(--hiq-green); font-weight: 700; }
.root :global(.hiq-ticket[data-kind="quick"] .hiq-reasons li span) { color: #a9750d; }
.root :global(.hiq-ticket[data-kind="followup"] .hiq-reasons li span) { color: #35707a; }

.root :global(.hiq-card-link),
.root :global(.hiq-inlinelink) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--hiq-orange-dark);
  font-size: 13px;
  font-weight: 700;
  text-underline-offset: 4px;
}
.root :global(.hiq-card-link) { margin-top: 18px; padding-top: 15px; border-top: 1px dashed #d6cdc2; }
.root :global(.hiq-inlinelink) { margin-top: 24px; font-size: 14px; }
.root :global(.hiq-card-link:hover),
.root :global(.hiq-inlinelink:hover) { text-decoration: underline; }
.root :global(.hiq-card-link span),
.root :global(.hiq-inlinelink span) { transition: transform .15s ease; }
.root :global(.hiq-card-link:hover span),
.root :global(.hiq-inlinelink:hover span) { transform: translateX(3px); }

/* THE QUESTION EACH CARD ENDS ON. Pushed to the bottom of the card so all
   three ask at the same height however long the middle runs. */
.root :global(.hiq-ask) { margin-top: auto; padding-top: 23px; }
.root :global(.hiq-ask-q) { display: block; margin-bottom: 11px; font-size: 14px; font-weight: 650; }

/* Two answers, and "Later" is a real one. It is the same size and the same
   height as the affirmative because the page's whole promise is that an alert
   never costs you more than one tap. */
.root :global(.hiq-answers) { display: grid; grid-template-columns: 1fr .78fr; gap: 9px; }
.root :global(.hiq-answers button) {
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--hiq-orange);
  border-radius: 7px;
  background: var(--hiq-orange);
  color: #25120a;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: inset 0 1px rgba(255, 255, 255, .3);
  transition: background .15s ease, box-shadow .15s ease, transform .15s ease;
}
.root :global(.hiq-answers button:hover) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(255, 95, 34, .2), inset 0 1px rgba(255, 255, 255, .34);
}
.root :global(.hiq-answers .hiq-later) { background: none; color: var(--hiq-orange-dark); }
.root :global(.hiq-answers button[data-selected="true"]) { box-shadow: inset 0 0 0 2px #1e130e; }
.root :global(.hiq-answers .hiq-later[data-selected="true"]) { background: #ffe3d5; }

/* The answer to the question the card just asked, so it cannot be the
   quietest thing on it. #14603a is 6.4:1 on the ticket's paper. */
.root :global(.hiq-said) {
  margin: 11px 0 0;
  min-height: 34px;
  color: #14603a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

/* ---- the text alert ------------------------------------------------------ */

.root :global(.hiq-text) {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 24%, rgba(255, 255, 255, .72), transparent 27%),
    radial-gradient(circle at 78% 63%, rgba(255, 118, 53, .14), transparent 28%),
    #ffe3d1;
  color: var(--hiq-ink);
  scroll-margin-top: 140px;
}
.root :global(.hiq-text-layout) {
  display: grid;
  grid-template-columns: minmax(320px, .85fr) minmax(0, 1.15fr);
  align-items: center;
  gap: clamp(48px, 8vw, 110px);
  padding-block: clamp(64px, 8vw, 90px);
}
.root :global(.hiq-text-copy h2) {
  margin: 0;
  font-size: clamp(34px, 4.6vw, 60px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -.05em;
  text-wrap: balance;
}
.root :global(.hiq-text-lede) { margin: 22px 0 36px; color: #526166; font-size: 19px; line-height: 1.55; }
.root :global(.hiq-text-copy dl) { margin: 0; }
.root :global(.hiq-text-copy dl > div) {
  display: grid;
  grid-template-columns: 145px 1fr;
  gap: 28px;
  padding: 21px 0;
  border-top: 1px solid rgba(25, 42, 48, .17);
}
.root :global(.hiq-text-copy dt) { font-weight: 700; }
.root :global(.hiq-text-copy dd) { margin: 0; color: #5a686c; font-size: 14px; line-height: 1.5; }

.root :global(.hiq-phone) {
  position: relative;
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
  padding: 18px 19px 24px;
  border: 8px solid #17282e;
  border-radius: 44px;
  background: linear-gradient(#fbfaf7, #f1efeb);
  color: #1b292e;
  box-shadow: 0 34px 78px rgba(83, 39, 20, .25), 0 0 0 1px rgba(255, 255, 255, .8), 0 0 0 10px rgba(255, 255, 255, .18);
}
.root :global(.hiq-phone-speaker) {
  position: absolute;
  top: 10px;
  left: 50%;
  width: 105px;
  height: 18px;
  border-radius: 999px;
  background: #17282e;
  transform: translateX(-50%);
}
/* EVERY LINE IN HERE HAS TO SURVIVE A JOBSITE.
   The whole message was set between 11px and 13px in grey on grey — a drawing
   of a notification rather than one you can read at a glance, which is the
   only claim it is making. Ink is near-black on a paler bubble, the sender is
   a real label rather than a whisper, and nothing in the thread is under
   12px. Measured against the bubble: 13.9:1 on the body, 6.1:1 on the sender
   and 5.6:1 on the reply line. */
.root :global(.hiq-phone-status) {
  display: flex;
  justify-content: space-between;
  padding: 7px 7px 20px;
  color: #17282e;
  font-size: 13px;
  font-weight: 700;
}
.root :global(.hiq-phone-app) {
  padding: 14px 0;
  border-bottom: 1px solid #cfccc5;
  color: #26383f;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .08em;
  text-align: center;
}
.root :global(.hiq-bubble) {
  margin-top: 34px;
  padding: 20px;
  border: 1px solid rgba(60, 75, 80, .22);
  border-radius: 20px 20px 20px 5px;
  background: linear-gradient(145deg, #f6f6f5, #eceded);
  color: #101c21;
  box-shadow: 0 12px 25px rgba(22, 38, 44, .1), inset 0 1px rgba(255, 255, 255, .9);
}
.root :global(.hiq-bubble-from) {
  display: block;
  margin-bottom: 12px;
  color: #3d4f56;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .06em;
}
.root :global(.hiq-bubble > strong) { display: block; font-size: 19px; font-weight: 700; line-height: 1.25; }
/* :not, because the reply line is a <p> child of the bubble too — and
   .hiq-bubble > p outranks .hiq-said on specificity, so without this the
   answer to the question comes out the same colour as the question. */
.root :global(.hiq-bubble > p:not(.hiq-said)) { margin: 10px 0 0; color: #24343a; font-size: 15px; font-weight: 500; }
.root :global(.hiq-bubble .hiq-answers) { margin-top: 18px; }
.root :global(.hiq-bubble .hiq-said) { text-align: left; }
/* A dead text field at the bottom of the screen, so the bubble reads as a
   message thread rather than a card. Absolute, because it belongs to the
   phone's chrome and not to the conversation. */
.root :global(.hiq-phone-field) {
  position: absolute;
  right: 18px;
  bottom: 22px;
  left: 18px;
  padding: 12px 16px;
  border: 1px solid #c4c1bb;
  border-radius: 999px;
  color: #6b7371;
  font-size: 13px;
}
/* The field is out of flow, so the bubble has to reserve its height or a long
   reply line ends up underneath it. */
.root :global(.hiq-phone) { padding-bottom: 78px; }

/* ---- the bridge ---------------------------------------------------------- */

.root :global(.hiq-bridge) {
  padding: clamp(72px, 8vw, 112px) 0 clamp(76px, 8vw, 118px);
  border-top: 1px solid var(--hiq-line);
  border-bottom: 1px solid var(--hiq-line);
  background:
    radial-gradient(circle at 84% 18%, rgba(255, 95, 34, .15), transparent 26%),
    radial-gradient(circle at 18% 88%, rgba(69, 148, 165, .12), transparent 30%),
    var(--hiq-navy-2);
  scroll-margin-top: 140px;
}

/* Five cards separated by the grid's own 1px gap showing the border colour
   through — one rule instead of five borders that double up at every seam. */
.root :global(.hiq-rail) {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--hiq-line-bright);
  border-radius: 22px;
  background: var(--hiq-line);
  list-style: none;
  box-shadow: 0 30px 72px rgba(0, 0, 0, .22), inset 0 1px rgba(255, 255, 255, .04);
}
.root :global(.hiq-stage) {
  position: relative;
  background: linear-gradient(155deg, rgba(17, 50, 61, .98), rgba(9, 33, 43, .98));
  transition: background .18s ease;
}
.root :global(.hiq-stage:hover) { background: linear-gradient(155deg, rgba(24, 61, 73, .98), rgba(11, 38, 49, .98)); }
/* THE WHOLE CARD IS THE LINK. Five "learn more" lines in a row would be five
   identical words under five different headings; the stage name is already
   the thing you would click. Padding lives on the anchor rather than the card
   so the hit area is the card, not a word inside it. */
.root :global(.hiq-stage a) {
  display: block;
  min-height: 245px;
  padding: 29px 23px 26px;
}
.root :global(.hiq-stage-go) {
  display: inline-block;
  color: #ff7840;
  transition: transform .15s ease;
}
.root :global(.hiq-stage a:hover .hiq-stage-go) { transform: translateX(4px); }
.root :global(.hiq-stage a:hover h3) { color: #ffd0bb; }
/* The arrow says the stages are consecutive; the last one has nowhere to
   point, so it does not get one. */
/* The connector between consecutive stages, distinct from the go-arrow in
   each heading: this one says the five are a sequence, that one says the card
   is a link. The last stage has nowhere to point, so it does not get one. */
.root :global(.hiq-stage:not(:last-child))::after {
  content: "→";
  position: absolute;
  top: 31px;
  right: 15px;
  z-index: 1;
  color: rgba(255, 120, 64, .58);
  font-family: var(--font-mono), ui-monospace, monospace;
  pointer-events: none;
}
.root :global(.hiq-stage-n) {
  color: #ff7840;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .14em;
}
.root :global(.hiq-stage h3) { margin: 54px 0 12px; font-size: 20px; font-weight: 600; letter-spacing: -.025em; transition: color .18s ease; }
.root :global(.hiq-stage p) { margin: 0; color: #9bb1ba; font-size: 13px; line-height: 1.55; }

.root :global(.hiq-bridge-actions) { margin-top: 34px; gap: 22px; }

/* ---- why it surfaced ----------------------------------------------------- */

.root :global(.hiq-why) {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, .85fr) minmax(380px, 1.15fr);
  align-items: center;
  gap: clamp(48px, 8vw, 110px);
  max-width: 1220px;
  margin: clamp(52px, 6vw, 78px) auto;
  padding: clamp(48px, 6vw, 82px) clamp(24px, 5vw, 72px);
  border: 1px solid var(--hiq-line-bright);
  border-radius: 28px;
  background:
    radial-gradient(circle at 83% 18%, rgba(255, 95, 34, .11), transparent 27%),
    linear-gradient(145deg, rgba(15, 45, 56, .9), rgba(8, 31, 41, .84));
  box-shadow: 0 32px 80px rgba(0, 0, 0, .2), inset 0 1px rgba(255, 255, 255, .043), inset 0 0 70px rgba(72, 151, 169, .035);
}
.root :global(.hiq-why-copy h2) {
  margin: 0;
  font-size: clamp(32px, 4.6vw, 60px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -.05em;
  text-wrap: balance;
}
/* Not :last-child — the section gained a link after the paragraph, and the
   paragraph's own styling should not depend on nothing following it. */
.root :global(.hiq-why-copy > p) { margin: 26px 0 0; color: var(--hiq-muted); font-size: 17px; line-height: 1.65; }
/* The inline feature link, on navy rather than on paper. */
.root :global(.hiq-inlinelink-light) { color: #ff8f5f; }

/* ---- the ask ------------------------------------------------------------- */

.root :global(.hiq-final) {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--hiq-line);
  background:
    radial-gradient(circle at 78% 36%, rgba(255, 95, 34, .16), transparent 28%),
    radial-gradient(circle at 18% 85%, rgba(64, 137, 153, .12), transparent 32%),
    var(--hiq-navy-2);
}
.root :global(.hiq-final-layout) {
  display: grid;
  grid-template-columns: 1.1fr .9fr;
  align-items: center;
  gap: clamp(48px, 6vw, 80px);
  padding-block: clamp(64px, 8vw, 90px);
}
.root :global(.hiq-final h2) {
  margin: 0;
  font-size: clamp(38px, 5.3vw, 68px);
  font-weight: 400;
  line-height: 1.01;
  letter-spacing: -.055em;
  text-wrap: balance;
}
.root :global(.hiq-final h2 em) { display: block; color: var(--hiq-orange); font-style: normal; }
.root :global(.hiq-reassurance) {
  margin: 22px 0 0;
  color: #91a9b2;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: .04em;
  text-transform: uppercase;
}
/* THE LAST PIECE OF PAPER ON THE PAGE.
   It was the wordmark on a card — the one thing here that asked to be looked
   at and gave nothing back. It is now the same job the hero opened on, four
   stages later and paid, which is the only honest way to close a page whose
   argument is that the request you accept becomes the record that gets paid.
   Rotated the other way from the hero's receipt so the two read as two
   dockets rather than one repeated. */
.root :global(.hiq-receipt-paid) { padding: 34px 30px 40px; transform: rotate(2deg); }
.root :global(.hiq-receipt-paid .hiq-stamp) { border-color: var(--hiq-green); color: #15633b; }
.root :global(.hiq-final-receipt .hiq-example) { margin-top: 30px; text-align: center; color: #7f97a1; }

/* ---- tablet -------------------------------------------------------------- */

@media (max-width: 960px) {
  .root :global(.hiq-hero),
  .root :global(.hiq-text-layout),
  .root :global(.hiq-why),
  .root :global(.hiq-final-layout) { grid-template-columns: minmax(0, 1fr); gap: 56px; }

  .root :global(.hiq-hero-copy) { max-width: 680px; }
  .root :global(.hiq-receipt-hero) { max-width: 520px; }
  .root :global(.hiq-grid) { grid-template-columns: minmax(0, 1fr); }

  /* Two across, and the fifth takes the whole width rather than leaving a hole
     where a sixth stage would be. */
  .root :global(.hiq-rail) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .root :global(.hiq-stage:last-child) { grid-column: 1 / -1; }

  /* The copy leads on a narrow screen. A phone drawing at the top of a
     section, above the heading that says what it is, is a picture nobody has
     been given a reason to look at yet. */
  .root :global(.hiq-text-copy) { order: -1; width: 100%; max-width: 680px; margin: 0 auto; }
  .root :global(.hiq-why-copy) { max-width: 700px; }
  .root :global(.hiq-why) { margin-inline: 20px; }
  .root :global(.hiq-receipt-why),
  .root :global(.hiq-receipt-paid) { width: 100%; max-width: 560px; margin-inline: auto; }
}

/* ---- phone --------------------------------------------------------------- */

@media (max-width: 760px) {
  /* The site header is 68px below this breakpoint, not 82. */
  .root :global(.hiq-nav) { top: 68px; }

  /* Three labels across 390px wrapped to two lines each and turned a 46px bar
     into a 112px block of broken words, under a header that is already fixed.
     It scrolls sideways instead: the labels stay on one line, and following
     one of the page's own anchors scrolls the matching link into view. */
  .root :global(.hiq-nav ol) {
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .root :global(.hiq-nav ol)::-webkit-scrollbar { display: none; }
  .root :global(.hiq-nav li) { flex: 0 0 auto; }
  .root :global(.hiq-hero),
  .root :global(.hiq-opps),
  .root :global(.hiq-text),
  .root :global(.hiq-bridge) { scroll-margin-top: 122px; }
}

@media (max-width: 700px) {
  .root :global(.hiq-hero h1),
  .root :global(.hiq-split h2),
  .root :global(.hiq-text-copy h2),
  .root :global(.hiq-why-copy h2),
  .root :global(.hiq-final h2) { font-size: 40px; }

  .root :global(.hiq-hero) { padding-block: 44px 60px; }
  .root :global(.hiq-lede) { font-size: 16px; }
  .root :global(.hiq-receipt-hero) { padding: 30px 22px 36px; }
  .root :global(.hiq-receipt-head h3) { font-size: 21px; }
  .root :global(.hiq-receipt-row) { min-height: 60px; font-size: 13px; }
  .root :global(.hiq-receipt-row strong) { font-size: 11px; }

  /* Three facts across a 390px screen gives each of them 116px, and every
     label wrapped to three lines. Stacked, they are three short sentences. */
  .root :global(.hiq-facts) { grid-template-columns: minmax(0, 1fr); }
  .root :global(.hiq-facts > div + div) { border-left: 0; border-top: 1px solid var(--hiq-line); }

  .root :global(.hiq-split) { grid-template-columns: minmax(0, 1fr); align-items: start; gap: 22px; }
  .root :global(.hiq-example) { text-align: left; }

  .root :global(.hiq-rail) { grid-template-columns: minmax(0, 1fr); }
  .root :global(.hiq-stage),
  .root :global(.hiq-stage:last-child) { grid-column: auto; min-height: 0; }
  .root :global(.hiq-stage h3) { margin-top: 34px; }
  /* Down a single column the arrow points off the side of the card. */
  .root :global(.hiq-stage:not(:last-child))::after { content: "↓"; }

  .root :global(.hiq-phone) { border-radius: 34px; }
  .root :global(.hiq-text-copy dl > div) { grid-template-columns: minmax(0, 1fr); gap: 9px; }

  .root :global(.hiq-why) { margin-inline: 12px; padding-inline: 22px; border-radius: 20px; }
  .root :global(.hiq-receipt-why) { padding: 30px 20px 40px; }

  .root :global(.hiq-receipt-paid) { padding: 28px 20px 36px; }
  /* The fixed signup bar is 54px plus its inset and it sits over whatever is
     at the bottom of the viewport. Reserving its height here means what it
     covers is always space. */
  .root :global(.hiq-final-layout) { padding-bottom: 96px; }
}

/* Nothing on this page depends on motion to be understood: the glare is
   atmosphere and every transition is a hover affordance. */
@media (prefers-reduced-motion: reduce) {
  .root :global(.hiq-hero)::before { animation: none; }
  .root :global(.hiq-ticket),
  .root :global(.hiq-answers button),
  .root :global(.hiq-card-link span),
  .root :global(.hiq-inlinelink span),
  .root :global(.hiq-button) { transition: none; }
  .root :global(.hiq-ticket):hover { transform: none; }
}
/* ===========================================================================
   §106 — A FEATURE PAGE'S HERO CAN SHOW THE ACTUAL SCREEN

   /features/back-office opened on a hand-built drawing of a job record. It is
   a good drawing and it makes the page's argument — that the customer, the
   scope, the conversation and the money are one object — but it is still divs
   shaped like software, at the top of a page selling software. The drawing has
   moved down to where that argument is actually made; the hero shows two real
   screens.

   CONTAINED, NOT COVERED, which is the whole reason this is not the homepage's
   slider. That one fits three flat captures to one 1600x1000 canvas and crops
   with "cover", which is right when a script has already normalised the set.
   Here the two shots are a flat capture of the quote builder and a transparent
   monitor render, and "cover" takes the corners off the monitor. Both are
   contained on a ground the colour of the app's own chrome instead: nothing is
   cut, they agree on a frame without agreeing on a shape, and the transparent
   one sits on a surface rather than on whatever is behind the section.
   =========================================================================== */

.root :global(.shot-slider) { position: relative; }

/* Sized by aspect ratio rather than by the image, so swapping a screenshot for
   one a few pixels different cannot shift the hero. */
.root :global(.shot-frame) {
  position: relative;
  aspect-ratio: 1600 / 1000;
  overflow: hidden;
  border: 1px solid rgba(174, 199, 211, .18);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 106, 36, .07), transparent 58%),
    #0a1017;
  box-shadow:
    0 40px 90px -30px rgba(0, 0, 0, .7),
    inset 0 0 0 1px rgba(255, 255, 255, .03);
}
/* The <picture> is what stacks and cross-fades; the <img> inside it is what
   gets contained. Setting both on one element would mean the source-switching
   wrapper had no box of its own. */
.root :global(.shot-pic) {
  position: absolute;
  inset: 0;
  display: block;
  opacity: 0;
  transition: opacity .55s ease;
}
.root :global(.shot-pic[data-on="true"]) { opacity: 1; }
.root :global(.shot-img) {
  width: 100%;
  height: 100%;
  padding: clamp(10px, 1.6vw, 20px);
  object-fit: contain;
}

/* ---- the dots, over the frame -------------------------------------------

   Same treatment as the homepage slider's (§93): the screen names are doing
   real work as accessible labels, but a second row of named controls under a
   screenshot competes with the screenshot. The dot is drawn INSIDE a 44px
   button rather than being the target itself. */
.root :global(.shot-tabs) {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 6px;
  border-radius: 0 0 18px 18px;
  /* A wash, so the dots hold against a pale screenshot without drawing a bar
     across the image. */
  background: linear-gradient(to top, rgba(6, 11, 17, .55), transparent);
  pointer-events: none;
}
.root :global(.shot-tabs button) {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  /* The label is the accessible name; it must not be painted. */
  font-size: 0;
  line-height: 0;
  color: transparent;
  pointer-events: auto;
}
.root :global(.shot-tabs i) {
  position: relative;
  display: block;
  width: 9px;
  height: 9px;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(255, 255, 255, .42);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .5);
  transition: background .2s ease, transform .2s ease;
}
.root :global(.shot-tabs button:hover i) { background: rgba(255, 255, 255, .7); transform: scale(1.15); }
.root :global(.shot-tabs button[data-on="true"] i) { background: rgba(255, 106, 36, .35); transform: scale(1.25); }
/* The dot doubles as the dwell timer, so the rotation is legible rather than
   something that just happens to you. Shares the homepage slider's keyframe. */
.root :global(.shot-tabs button[data-on="true"] i s) {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--orange);
  transform: scale(0);
  animation-name: showcaseDwell;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

/* The name of the screen you are looking at, under the frame. The dots say
   where you are; this says what it is, which the dots deliberately do not. */
.root :global(.shot-caption) {
  margin: 12px 0 0;
  color: #9db0bd;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 12px;
  letter-spacing: .1em;
  text-transform: uppercase;
  text-align: center;
}

/* Paused on hover, and never animated for somebody who asked for less motion.
   In both cases the dot is simply filled: a half-filled timer that is not
   counting is a lie about what is about to happen. */
.root :global(.shot-slider:hover .shot-tabs button[data-on="true"] i s) { animation: none; transform: scale(1); }
@media (prefers-reduced-motion: reduce) {
  .root :global(.shot-img) { transition: none; }
  .root :global(.shot-tabs i) { transition: none; }
  .root :global(.shot-tabs button[data-on="true"] i s) { animation: none; transform: scale(1); }
}

/* ON A PHONE THE FRAME TURNS PORTRAIT.
   A desktop capture contained in a 358px-wide landscape box renders the quote
   builder's line items about four pixels tall — a picture of software rather
   than a readable screen. Below 700px the frame is 3:4 and any shot carrying a
   phone capture serves that instead (see Shot.mobile), which is legible at the
   width it actually gets. A shot without one is simply centred in the taller
   box; a monitor render with air around it reads as deliberate, whereas the
   same render cropped to fill would lose its corners. */
@media (max-width: 700px) {
  .root :global(.shot-frame) { aspect-ratio: 3 / 4; }
  .root :global(.shot-img) { padding: 8px; }
  .root :global(.shot-caption) { font-size: 11px; }
}
/* ===========================================================================
   §107 — THE OPERATIONAL TOOLS ARE ONE RECORD, NOT FOUR SECTIONS

   This section was four stacked bands: a number, a heading, a sentence and two
   or three tool cards, four times down a cream page. Every band was true and
   none of them showed what the section claims — that these are not four
   products but four stages of ONE job record.

   So the record stays on screen and the stages move it. Four slots, always in
   the same order (when, who, what was said, what is owed), and each stage
   advances all four: the arrival tracker steps along, the crew row goes from
   "assigned" to hours logged, the message row carries a different automatic
   text, the money row moves deposit to balance to rebook. The header never
   changes: JOB J-1048, Alex Morgan, Royal Oak, with "Same job record" printed
   across the foot in case the point is missed.

   THE MATERIAL. Cream ground, one navy card, orange for exactly two things:
   the stage you are on, and the action the job is waiting for. Green is a
   completed state and never an accent — the same rule the rest of the site
   uses. The rows are white so the record reads as paper on a desk rather than
   as a dashboard, which is what the section is arguing about.

   TABS, and the ARIA pattern all the way down: a vertical tablist, roving
   tabindex, automatic activation with arrow keys, Home and End, and all four
   panels in the markup so every tool description stays in the HTML. Nothing
   autoplays. The transition is 200ms.
   =========================================================================== */

.root :global(.everything-index .index-heading h2) { max-width: 20ch; }

/* The old lede's second claim, as the pill the mockup puts it in. Written
   with .index-heading in the selector because that block styles its own
   :last-child paragraph grey, and this is not body copy. */
.root :global(.everything-index .index-heading .everything-note) {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin: 20px 0 0;
  padding: 10px 16px;
  border: 1px solid rgba(184, 67, 15, .28);
  border-radius: 999px;
  background: rgba(255, 106, 36, .07);
  color: #6b4a38;
  font-size: 13.5px;
  font-weight: 600;
}
.root :global(.everything-note span) {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid #c9430a;
  border-radius: 50%;
  color: #c9430a;
  font-size: 11px;
  font-weight: 800;
}

.root :global(.jrs) {
  display: grid;
  grid-template-columns: minmax(240px, .42fr) minmax(0, 1fr);
  align-items: start;
  gap: clamp(24px, 3.4vw, 44px);
  margin-top: clamp(30px, 4vw, 48px);
}

/* ---- the rail ------------------------------------------------------------ */

.root :global(.jrs-rail) {
  display: grid;
  gap: 6px;
  align-content: start;
}
.root :global(.jrs-rail [role="tab"]) {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  column-gap: 16px;
  padding: 16px 18px 16px 12px;
  /* Explicit areas, not source order. With three children in a two-column
     track the lead wrapped into the 56px numeral column and came out four
     words wide. */
  grid-template-areas: "num name" "num lead";
  border: 1px solid transparent;
  border-radius: 14px;
  background: none;
  text-align: left;
  cursor: pointer;
  transition: background .2s ease, border-color .2s ease;
}
/* THE THREAD DOWN THE NUMBERS. One line per tab, drawn from the middle of its
   own numeral to the middle of the next, so the four read as one sequence
   rather than four buttons. The last has nothing to join. */
.root :global(.jrs-rail [role="tab"]:not(:last-child))::after {
  content: "";
  position: absolute;
  top: 50%;
  bottom: -50%;
  left: 40px;
  width: 2px;
  background: rgba(201, 67, 10, .32);
}
.root :global(.jrs-rail [role="tab"]:hover) { background: rgba(255, 106, 36, .05); }
.root :global(.jrs-rail [role="tab"][data-on="true"]) {
  border-color: rgba(184, 67, 15, .3);
  background: linear-gradient(180deg, rgba(255, 106, 36, .1), rgba(255, 106, 36, .05));
}

.root :global(.jrs-num) {
  grid-area: num;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 2px solid rgba(120, 106, 96, .32);
  border-radius: 50%;
  background: var(--cream);
  color: #6e6a63;
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: 19px;
  font-weight: 700;
  transition: border-color .2s ease, color .2s ease;
}
.root :global([data-on="true"] .jrs-num) { border-color: #ff6a24; color: #c9430a; }

.root :global(.jrs-name) {
  grid-area: name;
  display: block;
  color: var(--ink);
  font-size: clamp(17px, 1.7vw, 19px);
  font-weight: 700;
  letter-spacing: -.01em;
}
/* The stage's own sentence, only under the stage you are on. Kept in the
   markup for all four — the tab is its own accessible name and this reads as
   part of it — and collapsed with a grid row rather than display:none, so the
   rail does not jump by a paragraph's height when the selection moves. */
.root :global(.jrs-lead) {
  grid-area: lead;
  display: block;
  overflow: hidden;
  max-height: 0;
  margin-top: 0;
  color: #5d615c;
  font-size: 13px;
  line-height: 1.55;
  opacity: 0;
  transition: max-height .2s ease, opacity .2s ease, margin-top .2s ease;
}
.root :global([data-on="true"] .jrs-lead) { max-height: 5em; margin-top: 6px; opacity: 1; }

/* ---- the record ---------------------------------------------------------- */

.root :global(.jrs-panel[hidden]) { display: none; }
.root :global(.jrs-panel) { min-width: 0; }
.root :global(.jrs-panel:focus-visible) { outline: 2px solid #c9430a; outline-offset: 6px; }

.root :global(.jrs-record) {
  padding: clamp(20px, 2.4vw, 30px) clamp(18px, 2.2vw, 28px) clamp(16px, 2vw, 22px);
  border-radius: 20px;
  background: linear-gradient(168deg, #0e2632, #071a24);
  box-shadow: 0 30px 70px -28px rgba(6, 26, 35, .55), inset 0 1px rgba(255, 255, 255, .05);
}
.root :global(.jrs-record-head) {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(174, 205, 216, .16);
}
.root :global(.jrs-record-head h4) {
  margin: 0;
  color: #f7f3ec;
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 700;
  letter-spacing: -.02em;
}
.root :global(.jrs-record-head p) { margin: 4px 0 0; color: #a8bdc5; font-size: 15px; }

.root :global(.jrs-rows) { display: grid; gap: 10px; margin-top: 18px; }

/* Each row is white paper with the glyph on a tinted stub down its left edge.
   Three columns: the stub, the sentence, and whatever that row's evidence is —
   which is a different shape every time, so it is placed rather than sized. */
.root :global(.jrs-row) {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  overflow: hidden;
  border-radius: 12px;
  background: #fffdf9;
  color: #16262e;
}
.root :global(.jrs-row-ic) {
  display: grid;
  place-items: center;
  align-self: stretch;
  padding: 14px 0;
  background: rgba(20, 45, 58, .07);
}
.root :global(.jrs-glyph) {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: #2c4b59;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.root :global(.jrs-row-text) {
  padding: 16px 18px;
  font-size: clamp(14.5px, 1.5vw, 16px);
  font-weight: 600;
}

/* The arrival tracker: four named states in order, current in orange. A list,
   because that is what it is — not a progress bar with labels stuck under it. */
.root :global(.jrs-track) {
  display: flex;
  gap: clamp(10px, 1.6vw, 22px);
  margin: 0;
  padding: 12px 18px 12px 0;
  list-style: none;
}
.root :global(.jrs-track li) {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 5px;
  color: #6f7a7e;
  font-size: 11.5px;
  white-space: nowrap;
}
.root :global(.jrs-track li i) {
  width: 11px;
  height: 11px;
  border: 2px solid #c3c9c7;
  border-radius: 50%;
  background: #fff;
}
/* The rule joining the dots, drawn from each dot to the one before it so the
   first has nothing hanging off its left. */
.root :global(.jrs-track li + li)::before {
  content: "";
  position: absolute;
  top: 5px;
  right: 50%;
  left: -100%;
  height: 2px;
  margin-right: 8px;
  background: #d8dcda;
}
.root :global(.jrs-track li[data-state="done"] i) { border-color: #2b9e61; background: #2b9e61; }
.root :global(.jrs-track li[data-state="done"] + li)::before { background: #9ed5b8; }
.root :global(.jrs-track li[data-state="now"] i) { border-color: #ff6a24; background: #ff6a24; box-shadow: 0 0 0 4px rgba(255, 106, 36, .16); }
.root :global(.jrs-track li[data-state="now"] span) { color: #c9430a; font-weight: 700; }

/* Initials, not faces. The crew on this record is invented, and a stock
   photograph of a stranger presented as your crew is a claim the page has no
   business making. */
.root :global(.jrs-people) { display: flex; align-items: center; gap: 12px; padding-right: 16px; }
.root :global(.jrs-chips) { display: flex; }
.root :global(.jrs-chips b) {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-left: -8px;
  border: 2px solid #fffdf9;
  border-radius: 50%;
  background: #dfe4e2;
  color: #3a4b52;
  font-size: 11.5px;
  font-weight: 700;
}
.root :global(.jrs-chips b:first-child) { margin-left: 0; }
.root :global(.jrs-pill) {
  padding: 7px 12px;
  border-radius: 8px;
  background: #eceeec;
  color: #46534f;
  font-size: 12px;
  font-weight: 650;
}

.root :global(.jrs-status) { display: flex; align-items: center; gap: 12px; padding-right: 16px; }
.root :global(.jrs-badge) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
  white-space: nowrap;
}
.root :global(.jrs-badge-ok) { border: 1px solid rgba(43, 158, 97, .35); background: rgba(43, 158, 97, .12); color: #1c7a49; }
/* On the navy header the same green has to carry itself against a dark ground
   rather than against paper, so it is the fill and not the ink. */
.root :global(.jrs-badge-stage) {
  padding: 10px 16px;
  border: 1px solid rgba(120, 190, 150, .4);
  background: rgba(43, 158, 97, .22);
  color: #cdf0dd;
  font-size: 13px;
}
.root :global(.jrs-tick) {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.root :global(.jrs-when) { color: #5f6b6e; font-size: 12.5px; white-space: nowrap; }

/* Drawn as the control it depicts, and not one: nothing in this record is
   operable, and a live-looking button that does nothing is worse than none. */
.root :global(.jrs-action) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 14px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 106, 36, .55);
  border-radius: 9px;
  color: #c9430a;
  font-size: 13px;
  font-weight: 700;
}
.root :global(.jrs-action i) { font-style: normal; font-size: 15px; }

.root :global(.jrs-same) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin: 18px 0 0;
  color: #8fa7b1;
  font-size: 13px;
}
/* Hairlines either side, so the line reads as a seal across the foot of the
   record rather than as one more sentence in it. */
.root :global(.jrs-same)::before,
.root :global(.jrs-same)::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(174, 205, 216, .18);
}
.root :global(.jrs-lock) {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

/* ---- the tools, kept ----------------------------------------------------- */

/* The two or three tools each stage is made of. They were cards on the page
   before this; they are still every word they were, under the record that
   shows them working — and each one is now a link to the part of a feature
   page that writes it up. A card that names a tool and does nothing is a dead
   end on a page whose whole job is to send people deeper.

   THE WHOLE CARD IS THE LINK. Padding lives on the anchor, not the <li>, so
   the hit area is the card rather than the two words at the top of it. */
.root :global(.jrs-tools) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 14px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.root :global(.jrs-tools li) {
  border: 1px solid rgba(120, 106, 96, .2);
  border-radius: 12px;
  background: rgba(255, 255, 255, .5);
  transition: border-color .2s ease, background .2s ease, transform .2s ease;
}
.root :global(.jrs-tools li:hover) {
  transform: translateY(-2px);
  border-color: rgba(201, 67, 10, .42);
  background: rgba(255, 255, 255, .82);
}
.root :global(.jrs-tools a) { display: block; height: 100%; padding: 16px 18px; }
.root :global(.jrs-tools b) {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
}
/* The arrow is inside the heading rather than parked in a corner, so the card
   reads as a link at the point where its name is. */
.root :global(.jrs-tools b span) { color: #c9430a; transition: transform .2s ease; }
.root :global(.jrs-tools li:hover b span) { transform: translateX(3px); }
.root :global(.jrs-tools li:hover b) { text-decoration: underline; text-underline-offset: 4px; }
.root :global(.jrs-tools a > span) { display: block; margin-top: 6px; color: #5d615c; font-size: 13px; line-height: 1.55; }

.root :global(.jrs-more) { grid-column: 2; margin: 18px 0 0; text-align: right; }
.root :global(.jrs-more a) {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #0e2632;
  font-size: 15px;
  font-weight: 700;
}
.root :global(.jrs-more a span) { color: #c9430a; transition: transform .2s ease; }
.root :global(.jrs-more a:hover) { text-decoration: underline; text-underline-offset: 4px; }
.root :global(.jrs-more a:hover span) { transform: translateX(4px); }

/* ---- narrow ------------------------------------------------------------- */

@media (max-width: 1000px) {
  /* The rail becomes a row of cards above the record. Horizontally scrollable
     rather than wrapped to two lines, so the four stay in one sequence and the
     record keeps the top of the section. Still a tablist, still arrow-key
     navigable; only the axis changed. */
  .root :global(.jrs) { grid-template-columns: minmax(0, 1fr); }
  .root :global(.jrs-rail) {
    grid-auto-flow: column;
    grid-auto-columns: minmax(190px, 1fr);
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 6px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
  }
  .root :global(.jrs-rail)::-webkit-scrollbar { display: none; }
  .root :global(.jrs-rail [role="tab"]) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "num" "name";
    align-content: start;
    row-gap: 10px;
    padding: 16px;
    border-color: rgba(120, 106, 96, .2);
    background: rgba(255, 255, 255, .5);
    scroll-snap-align: start;
  }
  /* A thread between cards in a scroller would be a line to somewhere off
     screen. */
  .root :global(.jrs-rail [role="tab"]:not(:last-child))::after { display: none; }
  .root :global(.jrs-num) { width: 40px; height: 40px; font-size: 15px; }
  .root :global(.jrs-lead) { display: none; }
  .root :global(.jrs-more) { grid-column: 1; }
}

@media (max-width: 760px) {
  /* THE ROW STACKS. Three columns across a 358px card gives the evidence about
     90px, which turns the arrival tracker into four wrapped words. The glyph
     stub runs the full height of the stacked rows instead, so the row still
     reads as one object. */
  .root :global(.jrs-row) { grid-template-columns: 48px minmax(0, 1fr); }
  .root :global(.jrs-row-ic) { grid-row: 1 / -1; }
  .root :global(.jrs-row-text) { padding: 14px 14px 4px; }
  .root :global(.jrs-track),
  .root :global(.jrs-people),
  .root :global(.jrs-status),
  .root :global(.jrs-action) { grid-column: 2; }
  .root :global(.jrs-track) { padding: 4px 14px 14px 0; overflow-x: auto; scrollbar-width: none; }
  .root :global(.jrs-track)::-webkit-scrollbar { display: none; }
  .root :global(.jrs-people),
  .root :global(.jrs-status) { flex-wrap: wrap; padding: 0 14px 14px; }
  .root :global(.jrs-action) { margin: 0 14px 14px; }
  .root :global(.jrs-record-head h4) { font-size: 26px; }
  .root :global(.jrs-more) { text-align: left; }
}

/* Nothing here depends on motion: the stage changes whether or not the fade
   runs, and there is no autoplay to stop. */
@media (prefers-reduced-motion: reduce) {
  .root :global(.jrs-rail [role="tab"]),
  .root :global(.jrs-num),
  .root :global(.jrs-lead),
  .root :global(.jrs-tools li),
  .root :global(.jrs-tools b span),
  .root :global(.jrs-more a span) { transition: none; }
  .root :global(.jrs-tools li:hover) { transform: none; }
}
/* ===========================================================================
   §108 — THE THINGS YOU TAP ON A PHONE

   Measured at 390x844 on /features/back-office before this, and the same three
   are on every marketing page because they are all in the shared chrome:

     .header-cta    129 x 36     the signup button, and the most-tapped
                                 control on the site
     .nav-toggle     37 x 44     44 was set and something narrower won
     .detail-back   108 x 13     a 13px-high hit area on the only way back to
                                 the feature index

   The floor everybody quotes is 44x44 (Apple) or 48x48 (Material); WCAG 2.2's
   Target Size (Minimum) is 24x24 and all three failed the spirit of it and two
   failed the letter. None of these needs to look bigger — the padding goes
   where it cannot be seen.
   =========================================================================== */

.root :global(.header-cta) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

/* min-width as well as width: the width was already 44 and lost to something
   narrower, and a minimum cannot be outbid by a smaller length. */
.root :global(.nav-toggle) { min-width: 44px; min-height: 44px; flex: 0 0 auto; }

/* THE PADDING IS THE TARGET, NOT THE TYPE.
   The label stays 10px and the row stays where it was: the extra height is
   padding above and below, taken back out of the margin underneath so nothing
   on the page moves. */
.root :global(.detail-back) {
  padding-block: 16px;
  margin-top: -16px;
  margin-bottom: 6px;
}

/* ---- the fixed bar stops sitting on things -------------------------------

   Two separate problems. The first is the notch: "bottom: 12px" puts the bar
   inside the home-indicator area on every iPhone since the X, so the last 20
   or so pixels of a 54px button are behind a system control. The second is
   that a fixed bar is 66px of viewport that the page does not know about —
   SiteFooter already stands it down over the hero, the closing CTA and the
   footer, but between those it floats over whatever happens to be at the
   bottom of the screen.

   env() with a fallback, because the same rule has to work in a browser that
   has never heard of a safe area. */
.root :global(.mobile-cta) {
  bottom: max(12px, env(safe-area-inset-bottom, 0px));
  padding-inline: 14px;
}

/* THREE OUTCOMES DO NOT FIT A TWO-COLUMN GRID.
   .detail-benefits is 1fr 1fr, which is right for the four and six that the
   sibling pages carry and leaves a bordered empty cell when a page compresses
   to three. :has() rather than a page-scoped override, so the grid answers to
   how many cards it actually has rather than to which page it is on. */
.root :global(.detail-benefits:has(> article:nth-child(3):last-child)) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 900px) {
  .root :global(.detail-benefits:has(> article:nth-child(3):last-child)) {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* THE CREAM PROOF STRIP, AT A READABLE SIZE AND A READABLE COLOUR.
   #747873 on #f5f0e7 at 10px is the least legible run of text on the marketing
   site — about 4.4:1, which clears the bar for body text only because the bar
   does not know how small it is. The size floor below handles narrow screens;
   this is the base, for the widths where four columns are genuinely wide
   enough and the type was small anyway. */
.root :global(.detail-proof small) { font-size: 12px; color: #5f635e; }

/* ---- the first button fits on the first screen ---------------------------

   Measured on /features/client-portal at 1280x720: the hero's own CTA began at
   y=783, sixty-three pixels below the fold, so the first screen of a page
   whose job is to get somebody to press a button contained no button but the
   header's. The hero reserves min-height 790px and 150px of top padding, which
   is right on a tall monitor and is more than the whole viewport on a laptop.

   Keyed to the VIEWPORT HEIGHT rather than its width, because that is the
   thing that is short — a 1280x720 laptop and a 1280x1100 desktop want
   different heroes and the same columns. */
@media (max-height: 860px) and (min-width: 901px) {
  .root :global(.detail-hero) { min-height: 0; padding-top: 118px; padding-bottom: 64px; }
  .root :global(.detail-hero h1) { font-size: clamp(44px, 4.4vw, 64px); letter-spacing: -3px; }
  .root :global(.detail-hero-note) { margin-top: 14px; }
}

/* ---- copy on a feature page is copy, not a caption -----------------------

   Measured on /features/ai-intake at 390x844: fifteen runs of real prose under
   13px, and four of them at 10. These three are the worst and all three are in
   the shared layout, so the same numbers are on five pages:

     .detail-proof small        10px   what each proof point actually claims
     .detail-benefits article p 11px   the benefit, under its heading
     .process-steps p           10px   the step, under its heading

   Ten pixels is a caption size, and none of these is a caption — they are the
   sentence that makes the heading above them mean something. The desktop grid
   is four columns of about 250px, which is where the small sizes came from; on
   a phone those columns are the full width and there is no reason for it. */
@media (max-width: 900px) {
  .root :global(.detail-proof b) { font-size: 14px; }
  .root :global(.detail-proof small) { font-size: 14px; line-height: 1.55; }
  .root :global(.detail-benefits article p) { font-size: 15px; line-height: 1.6; }
  .root :global(.process-steps p) { font-size: 15px; line-height: 1.6; }
  .root :global(.process-steps h3) { font-size: 18px; }
}

/* Not only on a phone. At 1024 the same four columns are ~230px each and the
   sentence under each heading is still 10px. */
@media (min-width: 901px) and (max-width: 1200px) {
  .root :global(.detail-proof small) { font-size: 12px; }
  .root :global(.detail-benefits article p) { font-size: 13px; }
  .root :global(.process-steps p) { font-size: 12.5px; }
}

/* ---- an in-page link lands where you can read it -------------------------

   Every feature page's hero carries a second button pointing at a section
   further down, and each of those sections arrived at y=0 — underneath a
   header that is fixed at 82px, 68px on a phone. Measured on all three before
   this: the heading a reader had just asked for was the one thing on screen
   they could not see. Same two numbers as SS96, for the same reason. */
.root :global(.section-block[id]),
.root :global(.detail-story[id]) { scroll-margin-top: 104px; }

@media (max-width: 760px) {
  .root :global(.section-block[id]),
  .root :global(.detail-story[id]) { scroll-margin-top: 88px; }
}

/* And the room it needs, reserved at the end of the page. 78px is the bar's
   54px plus its inset plus a line of breathing room, so the last row of real
   content clears it instead of being covered by it. */
@media (max-width: 760px) {
  .root :global(.detail-hero) ~ :global(.page-cta),
  .root :global(.detail-hero) ~ :global(.final-cta) { padding-bottom: 78px; }
}
`;

const HEADER = `/* GENERATED — do not edit. Run \`node scripts/generate-flagship-css.mjs\`.

   The standalone marketing site's stylesheet, scoped to the two routes that
   reproduce it (/home-flagship, /features-flagship). Every rule is emitted as
   \`.root :global(<selector>)\` so the markup keeps its original class names and
   nothing here can reach another route — .hero-copy, .eyebrow, .portal-card,
   .job-row and .status-badge all exist in this app's globals.css too.

   Deliberate design changes live in the TWEAKS block of the generator, which
   is appended after everything else. */

`;

writeFileSync(OUT, HEADER + scoped + '\n' + PREFLIGHT + TWEAKS);

const unscoped = scoped.split('\n').filter((l) => /^(html|body|\*|:root)[\s,{]/.test(l.trim()));
console.log(`wrote ${OUT}`);
console.log(`keyframes (local, hashed): ${[...keyframes].join(', ')}`);
console.log(`unscoped top-level selectors: ${unscoped.length}`);
if (unscoped.length) {
  console.log(unscoped.slice(0, 10).join('\n'));
  process.exitCode = 1;
}
