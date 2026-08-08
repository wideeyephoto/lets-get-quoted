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
.root :global(.sticky-product) {
  top: 82px;
  height: calc(100vh - 82px);
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

/* ---- the step wheel, off the mock ------------------------------------------

   At left:-57px a 124px wheel puts 67px of itself ON the product panel, and
   what is 67px in from that panel's left edge is the phone mock — so the badge
   landed squarely on "Is wastewater actively entering the room?" and the Yes
   button under it, which is the one exchange that whole panel exists to show.

   -92px hangs it in the column gutter instead, still overlapping the panel's
   edge enough to read as layered rather than parked beside it, and clearing
   the phone. Bounded at 1101px to sit exactly above the existing
   \`@media (max-width: 1100px)\` rule that moves the wheel to the top-right
   corner — one pixel of overlap and this TWEAK, being appended last, would win
   inside that query and undo the narrow layout. */
@media (min-width: 1101px) {
  .root :global(.wheel-wrap) { left: -92px; }
}
/* 761–1100px cannot use a gutter offset at all. The gap narrows to 36px while
   the panel keeps shrinking, so the phone mock inside it moves left faster
   than any fixed offset can retreat — measured at 1100, 1000, 900 and 800, a
   badge in that gutter sits on the phone at every one of them.
   So it goes where it already goes below 761px: the top-right corner of the
   stage, clear of both columns. */
@media (min-width: 761px) and (max-width: 1100px) {
  .root :global(.wheel-wrap) {
    left: auto;
    right: 6px;
    top: 0;
    transform: none;
    width: 96px;
    height: 96px;
  }
  .root :global(.wheel-core) { inset: 27px; }
}

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
   §01 — THE RISING CONSOLE

   Was a 50/50 split with the dashboard mock at about 40% of the screen. The
   copy is centred and the console goes full width beneath it, tilted back on
   arrival and levelling as the visitor scrolls.
   =========================================================================== */

.root :global(.hero-stage) {
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  align-items: start;
  text-align: center;
  gap: 0;
  min-height: 0;
  padding: 148px clamp(20px, 5vw, 86px) 92px;
}

/* The centred glow and the orbit rings were both sited against the old
   right-hand column. Re-centred behind the console. */
.root :global(.hero-stage)::before {
  left: 50%; right: auto; margin-left: -270px; top: 26%;
}
.root :global(.hero-stage .orbit-one) {
  width: 940px; height: 940px; top: -300px; right: auto; left: 50%; margin-left: -470px;
}
.root :global(.hero-stage .orbit-two) {
  width: 680px; height: 680px; top: -170px; right: auto; left: 50%; margin-left: -340px;
}

/* A class collision, and exactly the one this file's header warns about.
   src/app/globals.css:4045 gives .hero-copy a 32px-radius card — a gradient
   face, a border and 1.5rem of padding — and the flagship's own .hero-copy
   rule sets position, z-index and max-width, so it never resets any of it.
   Measured: rgba(8,18,31,.82) + linear-gradient, border-radius 32px.

   It has been leaking since the route was built. At 690px in the old left
   column it read as part of the composition; centred at 940px behind a
   headline it is unmistakably a stray panel. Reset explicitly — the flagship
   hero copy sits on the section, not on a card. */
.root :global(.hero-copy) {
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}
/* The measure and the size are set together, because the third line — "Run
   everything behind it." — is the longest and it is the one that decides both.
   At 940px and 94px it broke after "behind", leaving "it." alone on a fourth
   line; centred, a two-character widow is the first thing you see.
   balance gives an even break at the widths where it still has to wrap. */
.root :global(.hero-stage .hero-copy) { max-width: 1060px; }
.root :global(.hero-stage h1) {
  font-size: clamp(40px, 5.5vw, 86px);
  text-wrap: balance;
}
.root :global(.hero-stage .hero-sub) { max-width: 660px; margin: 28px auto 34px; }
.root :global(.hero-stage .hero-actions) { justify-content: center; }

/* text-align:left, because the section centres its copy and that inherits
   straight into the product mock: "NEEDS YOUR ATTENTION", the attention rows
   and both badge labels were centred inside a panel that is supposed to look
   like software. A dashboard does not centre its own labels. */
.root :global(.hero-stage .hero-product) {
  width: 100%;
  max-width: 1140px;
  height: auto;
  margin-top: 50px;
  perspective: 1700px;
  text-align: left;
}

/* In flow now, not absolutely placed in a fixed-height box. transform-origin
   above the top edge is what makes the tilt read as the panel rising toward
   you rather than rocking about its middle.

   animation:none is required, not tidying: dashboardFloat restates the whole
   transform at its 50% frame, and an animation's transform beats a
   stylesheet's — the scroll tilt would have been silently overridden. */
.root :global(.hero-stage .dashboard-card) {
  position: relative;
  top: 0; left: 0;
  width: 100%;
  height: 604px;
  transform-origin: 50% -14%;
  transform: none;
  animation: none;
}
.root[data-motion="on"] :global(.hero-stage .dashboard-card) {
  transform: rotateX(calc(13deg - var(--sp, 0) * 13deg));
}
.root :global(.hero-stage .dash-body) { height: calc(100% - 58px); }

/* The console is now ~1140px rather than ~669px, so the panel's type — which
   was scaled for the narrow column — reads small again in the wider box. */
.root :global(.hero-stage .dash-greeting h2) { font-size: 29px; }
.root :global(.hero-stage .attention-row) { font-size: 13.5px; }
.root :global(.hero-stage .attention-row b) { font-size: 21px; }
.root :global(.hero-stage .dash-grid strong) { font-size: 26px; }
.root :global(.hero-stage .dash-grid p) { font-size: 11.5px; }
.root :global(.hero-stage .dash-grid > div) { min-height: 132px; }

/* THE TWO NOTIFICATIONS.

   These are the moments the product exists to create — a lead worth calling,
   and money arriving — and on a 1254px console they were 310px and 265px cards
   in the same grey as the panel behind them, with 7px labels. Bigger, brighter,
   and each carrying its own accent so which one arrived reads at a glance:
   orange for the lead, mint for the money.

   alertFloat is dropped for the same reason dashboardFloat was — an animation
   owns the transform, and the front plane needs it.

   PLACEMENT. The alert was at top:-24px, which put it straight over the title
   bar: measured at every width from 390 to 1440 it covered "EXAMPLE BUSINESS ·
   LIVE" and the avatar. That label is the marker that stops a visitor
   believing the invented figures, so covering it is not a cosmetic problem.

   translateY(-100%) against top:9px lands the badge's BOTTOM 9px inside the
   card whatever height it grows to — over the top border and the rounded
   corner, clear of the 58px title bar's text. The plane offset has to be
   restated in the same transform or it is lost.

   And it is CLAMPED: min(0px, --plane-y). A front-plane element drifts both
   ways, and the downward half is what put the badge back on the title bar —
   measured +21px of drift at a 950px viewport, +49px at 700px, because the
   journey fraction grows as the viewport shrinks. There is no single offset
   that clears it at every height. Clamped, the badge can only ever travel AWAY
   from the card, which is the interesting direction anyway: it sweeps off as
   you scroll and it can never sweep onto the label underneath. */
.root :global(.hero-stage .floating-alert),
.root :global(.hero-stage .floating-paid) {
  animation: none;
  border-width: 1.5px;
  border-radius: 14px;
  padding: 15px 17px;
  background: linear-gradient(150deg, rgba(19,44,58,.985), rgba(9,23,33,.985));
}
.root :global(.hero-stage .floating-alert) {
  top: 0; right: 4px; bottom: auto;
  width: 372px;
  transform: translateY(-100%) translate3d(0, min(0px, var(--plane-y, 0px)), 0);
  border-color: rgba(255,106,36,.66);
  box-shadow:
    0 2px 0 rgba(255,255,255,.07) inset,
    0 28px 64px rgba(0,0,0,.52),
    0 0 50px rgba(255,106,36,.3);
}
.root :global(.hero-stage .floating-paid) {
  /* The console's content ends about 140px above its lower edge, and that band
     is where this sits. Its drift is bounded UPWARD rather than clamped to
     zero: as the page scrolls, plane offsets go negative, so a min(0px,...)
     clamp like the alert's would pin this one still and it would have no
     parallax at all. 18px of travel, which measured leaves 17px between the
     badge and the stats row above it. */
  bottom: 34px; left: 8px;
  width: 330px;
  transform: translate3d(0, clamp(-18px, var(--plane-y, 0px), 0px), 0);
  border-color: rgba(80,227,189,.58);
  box-shadow:
    0 2px 0 rgba(255,255,255,.06) inset,
    0 28px 64px rgba(0,0,0,.5),
    0 0 46px rgba(80,227,189,.24);
}

/* The eyebrow takes the accent. Measured on this ground: orange 5.2:1, mint
   9.4:1 — both clear AA at 9.5px/800. */
.root :global(.hero-stage .floating-alert small),
.root :global(.hero-stage .floating-paid small) {
  font-size: 9.5px; letter-spacing: 1.5px; font-weight: 800;
}
.root :global(.hero-stage .floating-alert small) { color: var(--orange); }
.root :global(.hero-stage .floating-paid small) { color: var(--mint); }
.root :global(.hero-stage .floating-alert b),
.root :global(.hero-stage .floating-paid b) {
  font-size: 15px; margin-top: 5px; letter-spacing: -.012em; color: #f3f8f9;
}
.root :global(.hero-stage .floating-alert .alert-icon) {
  width: 42px; height: 42px; border-radius: 10px; margin-right: 13px;
  font-size: 15px;
  background: rgba(255,106,36,.2);
  border: 1px solid rgba(255,106,36,.48);
}
.root :global(.hero-stage .floating-paid > i) {
  width: 40px; height: 40px; margin-right: 13px; font-size: 15px;
  background: rgba(80,227,189,.18);
  border: 1px solid rgba(80,227,189,.45);
}
/* NOW is the whole reason the alert matters, and it was 8px mint text. */
.root :global(.hero-stage .floating-alert em) {
  margin-left: 12px; padding: 3px 7px; border-radius: 4px;
  background: var(--orange); color: #2a0c00;
  font-size: 8.5px; font-weight: 800; letter-spacing: .1em;
}

/* Room for the alert to overhang without reaching the hero note above it. */
.root :global(.hero-stage .hero-product) { margin-top: 72px; }

/* ---- the Quick Stops wordmark ---------------------------------------------

   Sized against the label it replaces so the tiles keep their rhythm: the
   dash-grid's own <small> is 11px with a 4px gap, about 15px of band. */
.root :global(.quick-mini .qs-mark) { margin-bottom: 6px; }
.root :global(.quick-card .qs-mark) { margin: 10px 0 0; }

/* Centred under the console. text-align on the marker itself does nothing —
   it is display:inline-flex, so its own box is placed by the PARENT's
   text-align, and the parent is deliberately left-aligned so the dashboard
   labels inside it read as software. flex + max-content makes auto margins
   work on it directly. */
.root :global(.hero-stage .hero-product .example-mark) {
  position: static;
  display: flex;
  width: max-content;
  max-width: 100%;
  margin: 18px auto 0;
  white-space: normal;
}

/* The scale row was a column under the copy; centred layout leaves it no
   column, so it becomes a footer rule under the console. */
.root :global(.hero-stage .hero-scale) {
  width: 100%;
  max-width: 780px;
  margin-top: 46px;
  text-align: left;
}

@media (max-width: 1100px) {
  .root :global(.hero-stage) { padding-top: 128px; }
  /* 578, not 520: the panel's content needs 473px and the payment notification
     needs the band under it. At 520 the band was 55px and a 72px badge sat on
     the "6 jobs / 3 crews assigned" tile — measured at 1100 and at 900. */
  .root :global(.hero-stage .dashboard-card) { width: 100%; left: 0; height: 578px; }
  .root :global(.hero-stage .dash-grid > div) { min-height: 118px; }
}
/* The card clips silently — overflow:hidden and a definite height — so these
   numbers are measured against the panel's real content height at each width,
   not estimated. Measured slack at 760/600/390: 0px, 0px, 0px. */
@media (max-width: 760px) {
  .root :global(.hero-stage) { padding: 112px 20px 64px; }
  .root :global(.hero-stage .hero-product) { margin-top: 34px; }
  .root :global(.hero-stage .dashboard-card) {
    width: 100%; left: 0; height: 452px; transform: none;
  }
  .root[data-motion="on"] :global(.hero-stage .dashboard-card) { transform: none; }
  .root :global(.hero-stage .floating-alert) { top: -18px; right: -6px; }
  .root :global(.hero-stage .dash-greeting h2) { font-size: 22px; }
  .root :global(.hero-stage .dash-grid strong) { font-size: 20px; }
  .root :global(.hero-stage .hero-scale) { margin-top: 34px; }
}
/* Below 480 the attention rows and the three stat tiles both wrap, which adds
   about 40px of content the 452px box has no room for. */
@media (max-width: 480px) {
  .root :global(.hero-stage .dashboard-card) { height: 500px; }
}

/* ===========================================================================
   §02 — THE FEATURE TOUR, ELEVATED
   =========================================================================== */

/* ---- the step wheel, finally clear of the mock ----------------------------

   Measured at every width: the wheel was overlapping the product frame by
   31-33px, and at steps 01 and 03 that is real content — it covered the left
   edge of "Generate full site with AI" and the service-area field, and two
   street lines of the route map. A previous pass moved it to left:-92px and
   checked it against the PHONE inside step 02's frame, which is inset; the
   frame itself is not. The frame's left edge sits at the panel's left edge
   exactly (measured: -1px), so anything inside the panel is on top of it.

   Position alone cannot fix this. .scrolly-layout's gap is clamp(40px, 6vw,
   100px) — 66px at 1101px — and the wheel is 124px wide with a 9px spread
   ring, so it does not fit the gutter at any width the tour is used at.

   Both sides give a little: the wheel comes down to 104px with 24px nodes (the
   size the sub-1100px layout already uses) and a 6px ring, and the stage takes
   34px of left padding so the mock starts clear of it. The mock loses 34px of
   width; the alternative was a 132px gutter, which at 1101px there is no room
   for at all. */
@media (min-width: 1101px) {
  .root :global(.wheel-wrap) {
    left: -86px;
    width: 104px;
    height: 104px;
    box-shadow:
      0 2px 0 rgba(255, 255, 255, .05) inset,
      0 20px 44px rgba(0, 0, 0, .5),
      0 0 0 6px rgba(7, 19, 29, .74),
      0 0 44px rgba(255, 106, 36, .08);
  }
  .root :global(.wheel-node) { width: 24px; height: 24px; }
  .root :global(.wheel-core) { inset: 26px; }
  .root :global(.wheel-core b) { font-size: 15px; }
  .root :global(.sticky-product .visual-stage) { padding-left: 34px; }
}

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

/* ===========================================================================
   §03 — THE PIPELINE DRAWS ITSELF
   =========================================================================== */

.root :global(.pipeline-draw) {
  position: relative;
  z-index: 1;
  margin: 0 0 -6px;
  padding: 0 8px;
}
.root :global(.pipeline-draw svg) { display: block; width: 100%; height: 44px; overflow: visible; }
.root :global(.pipeline-draw path) { fill: none; stroke-width: 2; stroke-linecap: round; }
.root :global(.pipeline-track) { stroke: rgba(174, 199, 211, .2); stroke-width: 1; }
.root :global(.pipeline-ink) { stroke: var(--orange); filter: drop-shadow(0 0 6px rgba(255, 106, 36, .45)); }

/* Ungated, the stroke would sit at a full dash offset — an invisible line. So
   the resting state is the finished line, and only the motion build draws it.
   1600 is comfortably longer than the path, so the offset always clears it. */
.root[data-motion="on"] :global(.pipeline-ink) {
  stroke-dasharray: 1600;
  stroke-dashoffset: calc(1600 * (1 - var(--sp, 0)));
}

/* The accent bar under each stage already existed as a hover affordance. It
   becomes the progress readout: each stage fills as the stroke reaches it.
   The floor is .22 — exactly the value it rested at before — so the section
   looks identical to today when nothing is driving it. */
.root[data-motion="on"] :global(.workflow-pipeline .workflow-row > span)::after {
  transform: scaleX(clamp(.22, calc((var(--sp, 0) - var(--at, 0)) * 7), 1));
  transition: none;
}
.root[data-motion="on"] :global(.workflow-pipeline .workflow-row > span:hover)::after {
  transform: scaleX(1);
}
@media (max-width: 760px) {
  .root :global(.pipeline-draw) { display: none; }
}

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

/* Third child of a two-column section grid, so it landed in column one under
   the dark copy. Spanning both puts it under the cards it describes. */
.root :global(.ai-example-mark) {
  grid-column: 1 / -1;
  margin: 26px 0 0;
  text-align: right;
  color: #5c6870;
}
.root :global(.ai-example-mark b) { color: #1d2b33; }
@media (max-width: 1100px) {
  .root :global(.ai-example-mark) { text-align: left; }
}

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
