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
.root :global(.wheel-node) { font-size: 10px; }
.root :global(.wheel-core small) { font-size: 9px; }

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

/* ###########################################################################
   /how-it-works

   The page was 20 definition cards in a brown shell with its own header, its
   own logo treatment and its own navigation — a documentation page linking to
   a product site. It is now the same system as everything it links to, and the
   five stages are a journey rather than a table with five rows.

   THE COLOUR RULE, used identically on every graphic here:

     orange   you or your crew did it
     blue     the homeowner did it
     green    nobody did it — it happened on its own
     yellow   waiting on a person

   Green never means "good" and yellow never means "accent". That is what makes
   the swimlane readable at a glance: the middle lane is nearly empty and the
   green lane is not.
   ########################################################################### */

.root :global(.hiw-hand-you) { color: #ff8a4c; }

/* ---- hero ---------------------------------------------------------------- */

.root :global(.hiw-hero) {
  padding: clamp(52px, 7vw, 104px) clamp(20px, 5vw, 86px) clamp(56px, 7vw, 96px);
  text-align: center;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 106, 36, .16), transparent 42%),
    radial-gradient(circle at 12% 88%, rgba(42, 130, 161, .13), transparent 34%),
    linear-gradient(180deg, #0d222e, #0a1c26);
}
.root :global(.hiw-hero .eyebrow) { justify-content: center; }
.root :global(.hiw-hero h1) {
  margin: 14px auto 0;
  max-width: 16ch;
  font-size: clamp(38px, 5.6vw, 76px);
  line-height: 1.02;
  letter-spacing: -.03em;
  text-wrap: balance;
}
.root :global(.hiw-hero h1 em) { color: var(--orange); font-style: normal; }
.root :global(.hiw-lede) {
  margin: 20px auto 0;
  max-width: 62ch;
  font-size: clamp(16px, 1.5vw, 19px);
  line-height: 1.65;
  color: #a9bac4;
}
.root :global(.hiw-hero .hero-actions) { justify-content: center; margin-top: 34px; }

/* ---- the job journey ----------------------------------------------------- */

.root :global(.hiw-journey) {
  margin: clamp(40px, 5vw, 66px) auto 0;
  max-width: 1080px;
  text-align: left;
}
.root :global(.hiw-track) { position: relative; padding-bottom: 6px; }
.root :global(.hiw-rail) {
  position: absolute;
  left: 0; right: 0; top: 11px;
  height: 2px;
  border-radius: 2px;
  background: rgba(174, 199, 211, .18);
  overflow: hidden;
}
.root :global(.hiw-rail i) {
  display: block; height: 100%;
  background: linear-gradient(90deg, var(--orange), #ffb066);
  transform-origin: 0 50%;
  transition: transform .62s cubic-bezier(.3, .8, .3, 1);
  box-shadow: 0 0 12px rgba(255, 106, 36, .55);
}
.root :global(.hiw-nodes) {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}
.root :global(.hiw-node) { display: grid; justify-items: start; gap: 3px; }
.root :global(.hiw-node-dot) {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(174, 199, 211, .3);
  background: #0d222e;
  transition: border-color .3s ease, background .3s ease, box-shadow .3s ease;
}
.root :global(.hiw-node[data-on="true"] .hiw-node-dot) {
  border-color: var(--orange);
  background: radial-gradient(circle, var(--orange) 38%, #0d222e 42%);
  box-shadow: 0 0 0 5px rgba(255, 106, 36, .13);
}
.root :global(.hiw-node small) {
  margin-top: 8px;
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .14em;
  color: #7d92a1;
}
.root :global(.hiw-node b) { font-size: 13px; font-weight: 650; color: #cfdbe2; }
.root :global(.hiw-node[data-on="true"] b) { color: #f3f7f8; }

/* The record itself. It only ever gains rows — that is the argument. */
.root :global(.hiw-record-card) {
  margin-top: 30px;
  padding: 20px 22px;
  border: 1px solid rgba(255, 106, 36, .3);
  border-radius: 16px;
  background: linear-gradient(150deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .015));
  box-shadow: 0 26px 60px rgba(0, 0, 0, .3);
}
.root :global(.hiw-record-head) {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px;
  padding-bottom: 13px;
  border-bottom: 1px solid rgba(174, 199, 211, .15);
}
.root :global(.hiw-record-id) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px; letter-spacing: .13em; font-weight: 700;
  color: var(--orange);
}
.root :global(.hiw-record-head em) { font-style: normal; font-size: 13px; color: #9db0bd; }
.root :global(.hiw-record-chips) {
  display: flex; flex-wrap: wrap; gap: 9px;
  margin-top: 14px;
}
.root :global(.hiw-record-chips li) {
  padding: 8px 13px;
  border-radius: 999px;
  border: 1px solid rgba(174, 199, 211, .22);
  background: rgba(255, 255, 255, .04);
  font-size: 13px; font-weight: 600;
  color: #eef5f6;
  opacity: 0; transform: translateY(7px) scale(.96);
  transition: opacity .38s ease, transform .38s cubic-bezier(.2, .8, .3, 1);
}
.root :global(.hiw-record-chips li[data-on="true"]) { opacity: 1; transform: none; }
.root :global(.hiw-record-chips li[data-hand="homeowner"]) { border-color: rgba(143, 199, 232, .5); }
.root :global(.hiw-record-chips li[data-hand="you"]) { border-color: rgba(255, 138, 76, .55); }
.root :global(.hiw-record-chips li[data-hand="auto"]) { border-color: rgba(74, 222, 128, .45); }
.root :global(.hiw-record-foot) {
  margin: 14px 0 0;
  font-size: 13px;
  color: #7d92a1;
}

.root :global(.hiw-legend) {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px;
  margin: 26px auto 0;
  font-size: 13px;
  color: #9db0bd;
}
.root :global(.hiw-legend li) { display: flex; align-items: center; gap: 8px; }
.root :global(.hiw-legend i) { width: 10px; height: 10px; border-radius: 50%; }
.root :global(.hiw-legend li[data-hand="homeowner"] i) { background: #8fc7e8; }
.root :global(.hiw-legend li[data-hand="you"] i) { background: var(--orange); }
.root :global(.hiw-legend li[data-hand="auto"] i) { background: #4ade80; }

/* ---- proof strip --------------------------------------------------------- */

.root :global(.hiw-proof) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  padding: 0;
  background: rgba(174, 199, 211, .14);
  border-block: 1px solid rgba(174, 199, 211, .14);
}
.root :global(.hiw-proof div) {
  padding: 26px 18px;
  text-align: center;
  background: #0b1e28;
}
.root :global(.hiw-proof b) {
  display: block;
  font-size: clamp(28px, 3.4vw, 42px); font-weight: 750; letter-spacing: -.03em;
  font-variant-numeric: tabular-nums;
  color: #f3f7f8;
}
.root :global(.hiw-proof small) {
  display: block; margin-top: 5px;
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .16em;
  color: #8ea2b0;
}

/* ---- sticky stage nav ---------------------------------------------------- */

.root :global(.hiw-stagenav) {
  position: sticky; top: 0; z-index: 30;
  background: rgba(9, 25, 35, .93);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(174, 199, 211, .14);
}
.root :global(.hiw-stagenav-fill) {
  position: absolute; left: 0; bottom: -1px;
  width: 100%; height: 2px;
  background: linear-gradient(90deg, var(--orange), #ffb066);
  transform-origin: 0 50%;
  transition: transform .4s cubic-bezier(.3, .8, .3, 1);
}
.root :global(.hiw-stagenav ol) {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 clamp(12px, 3vw, 40px);
}
.root :global(.hiw-stagenav a) {
  display: flex; align-items: center; gap: 9px;
  padding: 15px 6px;
  color: #8ea2b0;
  transition: color .2s ease;
}
.root :global(.hiw-stagenav a:hover) { color: #e6eef2; }
.root :global(.hiw-stagenav small) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .1em;
}
.root :global(.hiw-stagenav span) { font-size: 13px; font-weight: 600; }
.root :global(.hiw-stagenav a[aria-current="true"]) { color: var(--orange); }

/* ---- the five stages ----------------------------------------------------- */

.root :global(.hiw-stage) {
  display: grid;
  grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr);
  gap: clamp(34px, 5vw, 74px);
  align-items: center;
  padding: clamp(56px, 7vw, 108px) clamp(20px, 5vw, 86px);
  scroll-margin-top: 62px;                 /* clears the sticky stage nav */
  border-bottom: 1px solid rgba(174, 199, 211, .1);
}
.root :global(.hiw-stage[data-flip="true"] .hiw-stage-copy) { order: 2; }
.root :global(.hiw-stage:nth-of-type(even)) { background: rgba(255, 255, 255, .014); }

.root :global(.hiw-stage-kicker) {
  display: flex; align-items: center; gap: 11px;
  margin: 0;
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .16em;
  color: #7d92a1;
}
.root :global(.hiw-stage-kicker span) {
  display: grid; place-items: center;
  width: 30px; height: 30px;
  border-radius: 9px;
  border: 1px solid rgba(255, 106, 36, .4);
  background: rgba(255, 106, 36, .1);
  color: var(--orange);
  font-size: 12px; font-weight: 700;
}
.root :global(.hiw-stage h2) {
  margin: 16px 0 0;
  font-size: clamp(28px, 3.4vw, 46px);
  line-height: 1.06; letter-spacing: -.028em;
  text-wrap: balance;
}
.root :global(.hiw-stage-summary) {
  margin: 13px 0 0;
  max-width: 46ch;
  font-size: clamp(15px, 1.4vw, 17px); line-height: 1.65;
  color: #a9bac4;
}

/* The four axes. Still four, still the same words — a row each with a coloured
   label, rather than four boxes that made every stage look like a spec sheet. */
.root :global(.hiw-notes) { margin: 28px 0 0; border-top: 1px solid rgba(174, 199, 211, .14); }
.root :global(.hiw-notes > div) {
  display: grid;
  grid-template-columns: 138px minmax(0, 1fr);
  gap: 18px;
  padding: 15px 0;
  border-bottom: 1px solid rgba(174, 199, 211, .12);
}
.root :global(.hiw-notes dt) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  line-height: 1.5;
}
.root :global(.hiw-notes > div[data-hand="you"] dt) { color: #ff9257; }
.root :global(.hiw-notes > div[data-hand="homeowner"] dt) { color: #8fc7e8; }
.root :global(.hiw-notes > div[data-hand="record"] dt) { color: #b8c8d3; }
.root :global(.hiw-notes > div[data-hand="auto"] dt) { color: #6ee7a0; }
.root :global(.hiw-notes dd) { font-size: 14px; line-height: 1.6; color: #b9c8d1; }

.root :global(.hiw-stage-visual) { display: grid; gap: 12px; }
.root :global(.hiw-stage-visual .example-mark) { margin: 0; justify-self: start; }

@media (max-width: 900px) {
  .root :global(.hiw-stage) { grid-template-columns: minmax(0, 1fr); }
  /* The visual leads on a phone: it is the thing that says which stage this is
     before any of the words do. */
  .root :global(.hiw-stage-visual) { order: -1; }
  .root :global(.hiw-stage[data-flip="true"] .hiw-stage-copy) { order: 0; }
  .root :global(.hiw-notes > div) { grid-template-columns: minmax(0, 1fr); gap: 5px; }
}

/* ---- the five visuals ---------------------------------------------------- */

.root :global(.hiw-vis) {
  padding: clamp(16px, 2vw, 24px);
  border: 1px solid rgba(174, 199, 211, .16);
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .012));
  box-shadow: 0 30px 70px rgba(0, 0, 0, .3);
  font-size: 13px;
  container-type: inline-size;
}

/* 01 build */
.root :global(.hiw-browser) { border: 1px solid rgba(174, 199, 211, .18); border-radius: 12px; overflow: hidden; background: #f7f4ee; }
.root :global(.hiw-browser-bar) {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px;
  background: #e6e0d5;
  border-bottom: 1px solid #d3ccbf;
}
.root :global(.hiw-browser-bar i) { width: 9px; height: 9px; border-radius: 50%; background: #bdb5a6; }
.root :global(.hiw-url) {
  flex: 1; margin-left: 8px;
  padding: 4px 10px; border-radius: 999px;
  background: #f7f4ee;
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; color: #5c5346;
}
.root :global(.hiw-live) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 10px; font-style: normal; font-weight: 700; letter-spacing: .1em;
  color: #1d7a45;
}
.root :global(.hiw-browser-body) { padding: 18px 16px; }
.root :global(.hiw-site-hero) { display: grid; gap: 5px; }
.root :global(.hiw-site-hero b) { font-size: 19px; color: #1d2b33; letter-spacing: -.02em; }
.root :global(.hiw-site-hero small) { font-size: 12px; color: #6b6255; }
.root :global(.hiw-site-cta) {
  justify-self: start; margin-top: 7px;
  padding: 8px 14px; border-radius: 8px;
  background: var(--orange); color: #3d1200;
  font-size: 12px; font-weight: 800;
}
.root :global(.hiw-site-grid) {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px;
  margin-top: 15px;
}
.root :global(.hiw-site-grid span) {
  padding: 9px 11px; border-radius: 8px;
  background: #eee8dd; color: #4b4437;
  font-size: 12px;
}
.root :global(.hiw-chips) { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.root :global(.hiw-chip) {
  padding: 7px 12px; border-radius: 999px;
  border: 1px solid rgba(255, 106, 36, .38);
  background: rgba(255, 106, 36, .09);
  font-size: 11px; letter-spacing: .05em; color: #ffb890;
}
.root :global(.hiw-chip b) { color: #fff2ea; font-weight: 700; margin-left: 5px; }

/* 02 qualify — off-white is the homeowner's side, ink is yours */
.root :global(.hiw-vis-qualify) { display: grid; grid-template-columns: minmax(0, .82fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.root :global(.hiw-phone) {
  padding: 14px; border-radius: 14px;
  background: #f7f4ee; color: #1d2b33;
  border: 1px solid #ded7cc;
}
.root :global(.hiw-phone-head) { font-size: 13px; font-weight: 700; margin-bottom: 11px; }
.root :global(.hiw-field) { margin-bottom: 9px; padding: 9px 10px; border-radius: 9px; background: #eee8dd; }
.root :global(.hiw-field small) { display: block; font-size: 10.5px; color: #6b6255; letter-spacing: .04em; }
.root :global(.hiw-field b) { display: block; margin-top: 2px; font-size: 12.5px; color: #22303a; }
.root :global(.hiw-photos) { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; }
.root :global(.hiw-photos span) { width: 30px; height: 30px; border-radius: 7px; background: linear-gradient(140deg, #cfc6b6, #b6ab99); }
.root :global(.hiw-photos small) { font-size: 11px; color: #6b6255; }
.root :global(.hiw-verify) { font-size: 11.5px; color: #1d7a45; font-weight: 650; }
.root :global(.hiw-verify i) { font-style: normal; margin-right: 5px; }

.root :global(.hiw-leadcard) { padding: 14px; border-radius: 14px; border: 1px solid rgba(255, 106, 36, .3); background: rgba(255, 106, 36, .05); }
.root :global(.hiw-lead-top) { display: flex; align-items: center; gap: 9px; }
.root :global(.hiw-score) {
  padding: 3px 9px; border-radius: 999px;
  font-family: var(--font-geist-mono), monospace;
  font-size: 10px; font-weight: 800; letter-spacing: .12em;
}
.root :global(.hiw-hot) { background: var(--orange); color: #3d1200; }
.root :global(.hiw-lead-top small) { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .1em; color: #8ea2b0; }
.root :global(.hiw-lead-name) { display: block; margin: 10px 0 11px; font-size: 15px; color: #f3f7f8; }
.root :global(.hiw-flags li) { display: flex; gap: 8px; padding: 5px 0; font-size: 12px; color: #b9c8d1; }
.root :global(.hiw-flags i) { font-style: normal; font-weight: 800; }
.root :global(.hiw-flags .ok i) { color: #4ade80; }
.root :global(.hiw-flags .warn i) { color: #ffd166; }
.root :global(.hiw-flags .warn) { color: #e4d3a4; }

/* 03 win — the homeowner's screen, so off-white throughout */
.root :global(.hiw-quote) { padding: 16px; border-radius: 14px; background: #f7f4ee; color: #1d2b33; border: 1px solid #ded7cc; }
.root :global(.hiw-quote-head) { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #ded7cc; }
.root :global(.hiw-quote-head b) { font-size: 15px; }
.root :global(.hiw-quote-head small) { font-size: 11px; color: #6b6255; }
.root :global(.hiw-lines li) {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: baseline;
  padding: 9px 0; border-bottom: 1px solid #e5dfd4;
  font-size: 12.5px;
}
.root :global(.hiw-lines em) {
  font-style: normal;
  font-family: var(--font-geist-mono), monospace;
  /* #7c7364 measured 4.23:1 on the quote's off-white. */
  font-size: 10px; letter-spacing: .05em; color: #675e50;
}
.root :global(.hiw-lines .est em) { color: #8a6a12; }
.root :global(.hiw-lines b) { font-variant-numeric: tabular-nums; font-size: 13px; }
.root :global(.hiw-quote-total) { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; font-size: 13px; }
.root :global(.hiw-quote-total b) { font-size: 21px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.root :global(.hiw-sign) { display: flex; align-items: baseline; gap: 11px; padding: 11px 12px; border-radius: 10px; background: #eee8dd; }
.root :global(.hiw-sign small) { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .12em; color: #6b6255; }
.root :global(.hiw-signature) { font-size: 19px; font-family: Georgia, "Times New Roman", serif; font-style: italic; color: #22303a; }
.root :global(.hiw-sign span) { margin-left: auto; font-size: 11px; color: #6b6255; }
.root :global(.hiw-paid) { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #dff2e4; color: #14532d; font-size: 12.5px; font-weight: 700; }
.root :global(.hiw-paid i) { font-style: normal; margin-right: 6px; }

/* 04 run */
.root :global(.hiw-vis-run) { display: grid; gap: 14px; }
.root :global(.hiw-week) { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.root :global(.hiw-day) { padding: 9px 7px; border-radius: 10px; border: 1px solid rgba(174, 199, 211, .15); background: rgba(255, 255, 255, .02); min-height: 84px; }
.root :global(.hiw-day small) { display: block; font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .1em; color: #7d92a1; }
.root :global(.hiw-day.is-on) { border-color: rgba(255, 106, 36, .45); background: rgba(255, 106, 36, .07); }
.root :global(.hiw-job) { display: block; margin-top: 7px; padding: 7px 8px; border-radius: 8px; background: var(--orange); color: #3d1200; font-size: 10.5px; font-weight: 700; line-height: 1.35; }
.root :global(.hiw-job b) { display: block; font-size: 11.5px; }
.root :global(.hiw-empty) { display: block; margin-top: 7px; height: 30px; border-radius: 8px; background: rgba(255, 255, 255, .03); }
.root :global(.hiw-run-side) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.root :global(.hiw-text), .root :global(.hiw-portal) { padding: 12px; border-radius: 12px; border: 1px solid rgba(174, 199, 211, .15); background: rgba(255, 255, 255, .025); }
.root :global(.hiw-text small), .root :global(.hiw-portal small) { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .12em; color: #7d92a1; }
.root :global(.hiw-text p) { margin: 8px 0 6px; font-size: 13px; color: #eef5f6; }
.root :global(.hiw-text em) { font-style: normal; font-size: 11px; color: #4ade80; }
.root :global(.hiw-portal ul) { margin-top: 9px; display: grid; gap: 6px; }
.root :global(.hiw-portal li) { display: flex; gap: 8px; font-size: 12px; color: #94a7b4; }
.root :global(.hiw-portal i) { font-style: normal; }
.root :global(.hiw-portal .done) { color: #cfdbe2; }
.root :global(.hiw-portal .done i) { color: #4ade80; }
.root :global(.hiw-portal .now) { color: #f3f7f8; }
.root :global(.hiw-portal .now i) { color: var(--orange); }

/* 05 grow */
.root :global(.hiw-vis-grow) { display: grid; gap: 0; }
.root :global(.hiw-receipt) { padding: 15px 16px; border-radius: 12px; border: 1px solid rgba(74, 222, 128, .35); background: rgba(74, 222, 128, .07); }
.root :global(.hiw-receipt small) { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .12em; color: #6ee7a0; }
.root :global(.hiw-receipt b) { display: block; margin: 4px 0 2px; font-size: 26px; letter-spacing: -.02em; color: #f3f7f8; font-variant-numeric: tabular-nums; }
.root :global(.hiw-receipt span) { font-size: 11.5px; color: #9db0bd; }
.root :global(.hiw-flowline) { justify-self: center; width: 2px; height: 26px; background: rgba(74, 222, 128, .3); position: relative; }
.root :global(.hiw-flowline i) { position: absolute; left: -3px; bottom: -1px; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }
.root :global(.hiw-follow) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.root :global(.hiw-follow-card) { padding: 12px; border-radius: 12px; border: 1px solid rgba(174, 199, 211, .15); background: rgba(255, 255, 255, .025); }
.root :global(.hiw-follow-card small) { font-family: var(--font-geist-mono), monospace; font-size: 10px; letter-spacing: .12em; color: #7d92a1; }
.root :global(.hiw-follow-card p) { margin: 8px 0; font-size: 13px; color: #eef5f6; }
.root :global(.hiw-two) { display: grid; gap: 6px; margin-bottom: 8px; }
.root :global(.hiw-two span) { padding: 7px 9px; border-radius: 8px; background: rgba(255, 255, 255, .04); font-size: 11.5px; color: #cfdbe2; }
.root :global(.hiw-follow-card em) { font-style: normal; font-size: 11px; color: #6ee7a0; }

@container (max-width: 430px) {
  .root :global(.hiw-vis-qualify), .root :global(.hiw-run-side), .root :global(.hiw-follow) {
    grid-template-columns: minmax(0, 1fr);
  }
  .root :global(.hiw-week) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* ---- the swimlane -------------------------------------------------------- */

.root :global(.hiw-lanes-band) {
  padding: clamp(60px, 8vw, 116px) clamp(20px, 5vw, 86px);
  background:
    radial-gradient(circle at 82% 6%, rgba(74, 222, 128, .09), transparent 30%),
    radial-gradient(circle at 10% 92%, rgba(255, 106, 36, .1), transparent 30%),
    linear-gradient(170deg, #0b1e28, #0a1721);
  border-top: 1px solid rgba(174, 199, 211, .12);
}
.root :global(.hiw-lanes-head) { max-width: 720px; }
.root :global(.hiw-lanes-head h2) {
  margin: 15px 0 0;
  font-size: clamp(28px, 3.6vw, 50px); line-height: 1.06; letter-spacing: -.03em;
}
.root :global(.hiw-lanes-head h2 em) { color: var(--orange); font-style: normal; }
.root :global(.hiw-lanes-head > p) { margin: 16px 0 0; max-width: 60ch; font-size: 16px; line-height: 1.65; color: #a9bac4; }

.root :global(.hiw-lanes) {
  display: grid;
  grid-template-columns: 118px repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: clamp(34px, 4vw, 54px);
}
.root :global(.hiw-lane-spine) {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  padding: 10px 0;
  border-block: 1px solid rgba(255, 106, 36, .28);
  background: linear-gradient(90deg, rgba(255, 106, 36, .1), rgba(255, 106, 36, .02));
}
.root :global(.hiw-spine-id) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .13em; font-weight: 700; color: var(--orange);
  padding-left: 12px;
}
.root :global(.hiw-spine-stage) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .12em; color: #8ea2b0;
}
.root :global(.hiw-lane-label) {
  grid-column: 1;
  grid-row: calc(var(--lane) + 1);
  margin: 0;
  align-self: center;
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
}
.root :global(.hiw-lane-label[data-hand="homeowner"]) { color: #8fc7e8; }
.root :global(.hiw-lane-label[data-hand="you"]) { color: #ff9257; }
.root :global(.hiw-lane-label[data-hand="auto"]) { color: #6ee7a0; }

.root :global(.hiw-lane-event) {
  grid-row: calc(var(--lane) + 1);
  grid-column: calc(var(--stage) + 1);
  padding: 12px 13px;
  border-radius: 12px;
  border: 1px solid rgba(174, 199, 211, .16);
  background: rgba(255, 255, 255, .03);
}
.root :global(.hiw-lane-event[data-hand="homeowner"]) { border-color: rgba(143, 199, 232, .34); }
.root :global(.hiw-lane-event[data-hand="you"]) { border-color: rgba(255, 138, 76, .38); }
.root :global(.hiw-lane-event[data-hand="auto"]) { border-color: rgba(74, 222, 128, .32); background: rgba(74, 222, 128, .05); }
.root :global(.hiw-lane-event b) { display: block; font-size: 13px; font-weight: 650; color: #f3f7f8; line-height: 1.35; }
.root :global(.hiw-lane-event small) { display: block; margin-top: 6px; font-size: 11.5px; line-height: 1.5; color: #9db0bd; }
.root :global(.hiw-lane-event i) { font-style: normal; color: #6ee7a0; }

.root :global(.hiw-lanes-tally) { margin: 26px 0 0; max-width: 62ch; font-size: 15px; line-height: 1.6; color: #cfdbe2; }
.root :global(.hiw-lanes-band .example-mark) { margin: 12px 0 0; }

/* On a phone the lanes become one vertical timeline in stage order — which is
   the DOM order, so nothing has to be reordered to get it. */
@media (max-width: 900px) {
  .root :global(.hiw-lanes) { grid-template-columns: minmax(0, 1fr); gap: 9px; }
  .root :global(.hiw-lane-spine) { grid-template-columns: none; display: flex; gap: 12px; flex-wrap: wrap; }
  .root :global(.hiw-spine-id) { padding-left: 0; }
  .root :global(.hiw-lane-label) { display: none; }
  .root :global(.hiw-lane-event) { grid-row: auto; grid-column: 1; border-left-width: 3px; }
  /* The lane is what the colour told you; with the labels gone it has to be
     said. */
  .root :global(.hiw-lane-event)::before {
    content: attr(data-hand);
    display: block; margin-bottom: 5px;
    font-family: var(--font-geist-mono), monospace;
    font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
  }
  .root :global(.hiw-lane-event[data-hand="homeowner"])::before { content: "HOMEOWNER"; color: #8fc7e8; }
  .root :global(.hiw-lane-event[data-hand="you"])::before { content: "YOU"; color: #ff9257; }
  .root :global(.hiw-lane-event[data-hand="auto"])::before { content: "AUTOMATIC"; color: #6ee7a0; }
}

/* ---- price band ---------------------------------------------------------- */

.root :global(.hiw-price) {
  padding: clamp(56px, 7vw, 100px) clamp(20px, 5vw, 86px);
  background: linear-gradient(150deg, #0d222e, #091923);
  border-top: 1px solid rgba(174, 199, 211, .12);
}
.root :global(.hiw-price h2) { margin: 15px 0 0; font-size: clamp(26px, 3.2vw, 42px); letter-spacing: -.028em; line-height: 1.08; }
.root :global(.hiw-price > p) { margin: 15px 0 0; max-width: 66ch; font-size: 16px; line-height: 1.65; color: #a9bac4; }
.root :global(.hiw-price .fee-tiers) { max-width: 760px; }

/* ---- the phone ----------------------------------------------------------- */

@media (max-width: 760px) {
  /* THE STAGE NAV. Five equal columns at 390px gives each link 73px, so every
     label wrapped to three lines and the bar became a 106px-tall block of
     broken words. It scrolls sideways instead — the current stage is scrolled
     into view by the browser when you follow one of its own anchors, and the
     fill bar underneath still says how far along the page you are. */
  .root :global(.hiw-stagenav) { top: 68px; }         /* clear of the sticky header */
  .root :global(.hiw-stagenav ol) {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-inline: 14px;
  }
  .root :global(.hiw-stagenav ol)::-webkit-scrollbar { display: none; }
  .root :global(.hiw-stagenav li) { flex: 0 0 auto; }
  .root :global(.hiw-stagenav a) { padding: 13px 14px 13px 0; white-space: nowrap; }

  /* Tightened, not truncated. The stage sections are 60% of this page on a
     phone and most of what made them tall was breathing room sized for a
     desktop column. */
  .root :global(.hiw-stage) { padding-block: 40px; scroll-margin-top: 124px; }
  .root :global(.hiw-notes) { margin-top: 20px; }
  .root :global(.hiw-notes > div) { padding: 11px 0; }
  .root :global(.hiw-hero) { padding-block: 40px 46px; }
  .root :global(.hiw-journey) { margin-top: 32px; }
  .root :global(.hiw-lanes-band) { padding-block: 48px; }
  .root :global(.hiw-price) { padding-block: 44px; }

  /* THE FIXED BAR COVERS THINGS. It is 54px plus a 12px inset and it sits over
     whatever is at the bottom of the viewport — on this page that was the
     "invented job" marker under each stage visual. Reserving the bar's height
     at the end of every section it can land on means the thing it covers is
     always space rather than a sentence. */
  .root :global(.hiw-stage-visual) { padding-bottom: 12px; }
  .root :global(.hiw-lanes-band) { padding-bottom: 96px; }
}

/* The journey rail is horizontal at every width, but five labelled nodes do
   not fit across a phone. Below 620 it becomes a vertical list — the same
   sequence, read down the page like everything else on it. */
@media (max-width: 620px) {
  .root :global(.hiw-nodes) { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .root :global(.hiw-node) { grid-template-columns: 24px minmax(0, 1fr); align-items: center; column-gap: 12px; }
  .root :global(.hiw-node-dot) { grid-row: 1 / span 2; }
  .root :global(.hiw-node small) { margin-top: 0; grid-column: 2; align-self: end; }
  .root :global(.hiw-node b) { grid-column: 2; align-self: start; }
  /* A horizontal rail behind a vertical list is a line through the middle of
     the labels. */
  .root :global(.hiw-rail) { display: none; }
  /* Stacking these made the strip taller (202px) than the three columns it
     replaced (123px) — a strip whose whole job is to be glanced at. It stays
     three across; the type comes down instead. */
  .root :global(.hiw-proof div) { padding: 16px 8px; }
  .root :global(.hiw-proof b) { font-size: 24px; }
  .root :global(.hiw-proof small) { font-size: 9.5px; letter-spacing: .1em; }
}

/* The flagship's closing band carries min-height 620px, which is right when it
   is the last word after a homepage. Here the page has already made the ask in
   the hero and again beside the price, so it can be the size of its own
   content. */
@media (max-width: 760px) {
  .root :global(.hiw-hero) ~ :global(.final-cta) { min-height: 0; padding-block: 64px 76px; }
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
.root :global(.feature-link-grid > a[id]),
.root :global(.capability-band) { scroll-margin-top: 104px; }

@media (max-width: 760px) {
  .root :global(.feature-link-grid > a[id]),
  .root :global(.capability-band) { scroll-margin-top: 88px; }
}

/* The eight tools used to be one flat 4x2 grid numbered 01..08. Same eight,
   now under the four names the homepage badges use, because a badge that says
   "Get Paid Faster" should arrive at a heading that says "Get Paid Faster"
   rather than at a grid the visitor has to read through. */
.root :global(.capability-band + .capability-band) { margin-top: 52px; }

.root :global(.capability-head) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 14px;
  margin-bottom: 18px;
}
.root :global(.capability-head > span) {
  font-family: var(--font-geist-mono), monospace;
  font-size: 11px;
  letter-spacing: .08em;
  color: #b8430f;
}
.root :global(.capability-head h3) {
  margin: 0;
  font-size: clamp(21px, 2.4vw, 27px);
  color: var(--ink);
}
.root :global(.capability-head p) {
  grid-column: 2;
  margin: 7px 0 0;
  max-width: 62ch;
  color: #5d615c;
  font-size: 13px;
  line-height: 1.6;
}

/* auto-fit, not the inherited repeat(4,1fr): the groups hold two or three
   tools, and a fixed four-column track would leave a bordered empty cell at
   the end of every row. min() keeps a single card from being forced wider
   than the viewport on a phone. */
.root :global(.capability-tools) {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
}
.root :global(.capability-tools article) {
  min-height: 0;
  padding: 22px 24px 24px;
}
.root :global(.capability-tools h4) {
  margin: 0 0 9px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ink);
}
/* The flat grid set these at 10px. Same reason as the strip above: this is a
   description someone is meant to read, not a caption. */
.root :global(.capability-tools p) {
  margin: 0;
  color: #5d615c;
  font-size: 12.5px;
  line-height: 1.6;
}

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
   §101 — /HOW-IT-WORKS EXPLAINS THOROUGHLY AND CONVERTS SLOWLY

   Measured at 1280x720 and 390x844 before any of this:

     page height          7,403px desktop        10,537px mobile
     hero height            924px                 1,150px
     first CTA at y=          782                   1,056  (and the demo
                                                            link at 1,120)
     fixed chrome            137px                   173px — header 68,
                                                     stage nav 51, bottom
                                                     signup bar 54: 20.5%
                                                     of an 844px screen
     tapping a stage         —                     lands on the mockup, with
                                                     the heading that names it
                                                     559px further down
     copy under 12px         63 elements across 11 selectors

   Five separate fixes below, plus the one in the markup (the four axes became
   three and a <details>) and the one in site-chrome.tsx (the bottom bar stands
   down while the stage nav is on screen).
   =========================================================================== */

/* ---- 1. the stage is three blocks, and on a phone they interleave ---------

   It was a copy column and a visual column, and at 900px the visual took
   \`order: -1\` so it led. Which meant the anchor target — the section — began
   with a product screenshot, and the number and heading that say WHICH stage
   you just tapped were most of a screen below it. Named areas instead: the
   head can lead on a phone while the visual still sits beside the whole copy
   column on a desktop. */
.root :global(.hiw-stage) {
  grid-template-areas: "head visual" "notes visual" "more visual";
  column-gap: clamp(34px, 5vw, 74px);
  row-gap: 0;
  align-items: start;
  align-content: center;
  /* 82px header + 55px stage nav, plus room to breathe. The old value was 62,
     which cleared the stage nav and left the heading under the header. */
  scroll-margin-top: 152px;
}
.root :global(.hiw-stage[data-flip="true"]) {
  grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
  grid-template-areas: "visual head" "visual notes" "visual more";
}
.root :global(.hiw-stage-head) { grid-area: head; }
.root :global(.hiw-stage-visual) { grid-area: visual; align-self: center; }
.root :global(.hiw-stage .hiw-notes) { grid-area: notes; }
.root :global(.hiw-record) { grid-area: more; }

@media (max-width: 900px) {
  /* Head, then the mockup it describes, then the detail. The old
     \`.hiw-stage-visual { order: -1 }\` and its data-flip partner are gone —
     nothing is ordered by hand any more. */
  .root :global(.hiw-stage),
  .root :global(.hiw-stage[data-flip="true"]) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "head" "visual" "notes" "more";
  }
  .root :global(.hiw-stage-visual) { margin-top: 26px; }
  /* Header 68 + stage nav 51 at this width. */
  .root :global(.hiw-stage) { scroll-margin-top: 134px; }
}

/* ---- 2. "the record gains" folds away ------------------------------------

   Four dense axes per stage, five stages over. This is the one a reader can
   take on trust, and the only one restated in the swimlane below. */
.root :global(.hiw-record) {
  margin: 0;
  border-bottom: 1px solid rgba(174, 199, 211, .12);
}
.root :global(.hiw-record summary) {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 15px 0;
  cursor: pointer;
  list-style: none;
  color: #b8c8d3;
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  transition: color .18s ease;
}
/* Safari draws its own triangle through ::-webkit-details-marker. */
.root :global(.hiw-record summary::-webkit-details-marker) { display: none; }
.root :global(.hiw-record summary:hover) { color: #e6eef2; }
/* The chevron. Two borders on a rotated square — no glyph, so it cannot fall
   back to a font that does not have one. */
.root :global(.hiw-record summary i) {
  flex: none;
  width: 8px; height: 8px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform .2s ease;
}
.root :global(.hiw-record[open] summary i) { transform: translateY(1px) rotate(225deg); }
.root :global(.hiw-record > p) {
  margin: 0;
  padding: 0 0 18px;
  font-size: 14px; line-height: 1.6; color: #b9c8d1;
}
.root :global(.hiw-record > p b) { color: #dfe8ed; font-weight: 650; }

@media (prefers-reduced-motion: reduce) {
  .root :global(.hiw-record summary i) { transition: none; }
}

/* ---- 3. the $0 carries its own condition ---------------------------------

   The strip said "$0 / PER MONTH" beside two facts that are flatly true, and
   the rest of that sentence — the platform fee — was 9,000px down the page on
   a phone. */
.root :global(.hiw-proof-fee) {
  display: block;
  padding: 26px 18px;
  text-align: center;
  background: #0b1e28;
  transition: background .18s ease;
}
.root :global(.hiw-proof-fee:hover) { background: #0e2532; }
.root :global(.hiw-proof-fee b) {
  display: block;
  font-size: clamp(28px, 3.4vw, 42px); font-weight: 750; letter-spacing: -.03em;
  font-variant-numeric: tabular-nums;
  color: #f3f7f8;
}
.root :global(.hiw-proof-fee small) {
  display: block; margin-top: 5px;
  font-family: var(--font-geist-mono), monospace;
  font-size: 12px; letter-spacing: .09em; line-height: 1.5;
  color: #8ea2b0;
}
.root :global(.hiw-proof-fee em) {
  display: block; margin-top: 9px;
  font-style: normal; font-size: 12px; font-weight: 650;
  color: var(--orange);
}

@media (max-width: 620px) {
  /* Three cells at 390px is 129px each, and this one has a sentence in it. */
  .root :global(.hiw-proof) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .root :global(.hiw-proof-fee) { grid-column: 1 / -1; }
}

/* ---- 4. one disclaimer, placed -------------------------------------------

   A band, not a rule on the mark itself: .example-mark is an inline-flex pill
   with its own padding, so styling the <p> directly turns the pill into a
   full-bleed bar. It is inline-level, which is why the centering is text-align
   on the parent and not a margin on the child. */
.root :global(.hiw-example-band) {
  padding: 22px clamp(20px, 5vw, 86px) 0;
  text-align: center;
}
.root :global(.hiw-example-band .example-mark) { margin: 0; }

/* ---- 5. the 12px floor, on the page's own words --------------------------

   63 elements of real copy rendered between 9.5px and 11.5px on a phone. The
   45 inside the mockups are deliberately small — they are a drawing of a
   screen, and blowing them up would break the drawing — but none of them
   carries a claim this page needs read. These do. */
.root :global(.hiw-hero .eyebrow),
.root :global(.hiw-lanes-band .eyebrow),
.root :global(.hiw-price .eyebrow),
.root :global(.hiw-proof small),
.root :global(.hiw-stage-kicker),
.root :global(.hiw-stagenav small),
.root :global(.hiw-notes dt),
.root :global(.hiw-lane-label),
.root :global(.hiw-spine-id),
.root :global(.hiw-spine-stage),
.root :global(.hiw-lane-event small),
.root :global(.hiw-legend li),
.root :global(.final-cta .eyebrow),
.root :global(.hiw-price .fee-tiers small),
/* Site-wide, and the last 11px string on the page: the footer copyright. It
   is one line in its own row, so there is nothing for a pixel to disturb. */
.root :global(footer > span) { font-size: 12px; }

/* Tracking that reads at 11px is too loose at 12 in the same box — the stage
   kicker and the nav numerals both sit in fixed-width furniture. */
.root :global(.hiw-stage-kicker),
.root :global(.hiw-proof small) { letter-spacing: .12em; }
.root :global(.hiw-stagenav small) { letter-spacing: .06em; }

/* ---- 7. the stage nav stops sitting on the site header -------------------

   Below 760 the stage nav already carries \`top: 68px\` to clear the sticky
   header. Above it, nobody ever set one — so the moment you scrolled past the
   hero on a desktop, a 55px bar with z-index 30 parked itself on top of an
   82px header with z-index 20 and the brand, the whole site nav, Sign in and
   the header CTA were gone for the rest of the page. Measured at 1280 before
   this: elementFromPoint at the header's own vertical centre returned a stage
   link, on both the logo and the button.

   The header is position:fixed here, so this is the one number that keeps the
   two apart. Matched to the header's height, and to the 68px already written
   below the breakpoint. */
@media (min-width: 761px) {
  .root :global(.hiw-stagenav) { top: 82px; }
}

/* ---- 6. one signup button at a time --------------------------------------

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
  /* Composited, and the only property the loop writes besides opacity. */
  will-change: transform, opacity;
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

/* THE HERO GOES TO ONE COLUMN AT 1100 (the .hero-split rule further up this
   file), and one column means the copy is 691-720px wide inside a 768-1100px
   section. There is no margin left to orbit in: an ellipse that cleared the
   copy horizontally would need rx ~= 425 in a 768px box. So the layer is off
   below the two-column breakpoint, and the component's own matchMedia carries
   the same number so the loop never starts there either.

   The hero still looks complete without it, which was one of the acceptance
   criteria — nothing here is load-bearing. */
@media (max-width: 1100px) {
  .root :global(.trade-orbit) { display: none; }
}

/* Reduced motion keeps the objects and loses the movement. The component
   places them once and never starts the loop; this stops the reveal fading in
   as well, so the hero simply has five tools in it. */
@media (prefers-reduced-motion: reduce) {
  .root :global(.trade-orbit) { transition: none; }
  .root :global(.trade-orbit-item) { will-change: auto; }
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
