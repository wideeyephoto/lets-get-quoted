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
