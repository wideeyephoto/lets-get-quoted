/**
 * Generates src/components/command-center-deck.css from the wheel stylesheet.
 *
 * WHY THIS EXISTS, RATHER THAN JUST IMPORTING feature-wheel-story.css
 *
 * Two reasons, and the first is a correctness problem rather than a size one.
 *
 * 1. A SPECIFICITY TIE. The flagship homepage re-declares Tailwind's preflight
 *    inside its scope — `.root h1, .root h2, ... { font-size: inherit; ... }`
 *    — because globals.css sets `h1 { max-width: 11ch }`, which alone collapses
 *    the hero headline. Those selectors are (0,1,1). Fourteen rules in the
 *    wheel stylesheet are ALSO (0,1,1) on the same elements: `.cc-head h2`,
 *    `.cc-card-ic svg`, `.cc-job b`, `.cc-fstep i` and friends. A tie is broken
 *    by stylesheet order, and the order of a CSS Module against a plain CSS
 *    import is decided by the bundler's chunk graph — not something to ship a
 *    heading's font-size on. Every selector here is prefixed with `.cc-root`,
 *    which puts all of them at (0,2,1) and settles it by specificity instead.
 *
 * 2. SIZE. The source is 57KB and roughly 60% of it styles the wheel, which the
 *    homepage does not render. Only rules the deck's own markup can match are
 *    carried over.
 *
 * The rules themselves are copied verbatim — declarations are never rewritten,
 * so the deck cannot visually drift from the one on /home-classic. Run:
 *
 *   node scripts/generate-command-center-css.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'src/app/features/feature-wheel-story.css';
const MARKUP = 'src/app/features/command-center-markup.ts';
const OUT = 'src/components/command-center-deck.css';

/** The wrapper the deck component puts around the markup. */
const ROOT = 'cc-root';

/* --------------------------------------------------------------------------
   What the deck can actually match
   -------------------------------------------------------------------------- */

const markupSrc = readFileSync(MARKUP, 'utf8');
const litAt = markupSrc.indexOf('COMMAND_CENTER_MARKUP = "');
if (litAt < 0) throw new Error('COMMAND_CENTER_MARKUP not found');
const lit = markupSrc.slice(litAt + 'COMMAND_CENTER_MARKUP = '.length).match(/"(?:[^"\\]|\\.)*"/)[0];
const html = JSON.parse(lit);

const used = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].trim().split(/\s+/)) used.add(c);
}

// Applied at runtime by the deck component, so they never appear in the markup.
// `fw-scope` is the wrapper itself: it declares the palette custom properties
// (--panel, --ink, --orange, --mono ...) that every rule below reads.
for (const c of ['fw-scope', 'sr-only', 'cc-anim', 'cc-live', 'in']) used.add(c);

/* --------------------------------------------------------------------------
   A small CSS parser — enough for this file, no dependency
   -------------------------------------------------------------------------- */

/** Splits a stylesheet body into { prelude, body } blocks and bare statements. */
function parse(css) {
  const nodes = [];
  let i = 0;
  let start = 0;

  const skipToken = () => {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      return true;
    }
    if (c === '"' || c === "'") {
      i += 1;
      while (i < css.length && css[i] !== c) i += css[i] === '\\' ? 2 : 1;
      i += 1;
      return true;
    }
    return false;
  };

  while (i < css.length) {
    if (skipToken()) continue;
    const c = css[i];

    if (c === '{') {
      // Comments are skipped as delimiters above but still sit in the slice —
      // the file's leading banner would otherwise become part of the first
      // rule's selector list.
      const prelude = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
      let depth = 1;
      i += 1;
      const bodyStart = i;
      while (i < css.length && depth > 0) {
        if (skipToken()) continue;
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') depth -= 1;
        i += 1;
      }
      nodes.push({ prelude, body: css.slice(bodyStart, i - 1) });
      start = i;
      continue;
    }

    if (c === ';') {
      const text = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
      if (text) nodes.push({ statement: text });
      i += 1;
      start = i;
      continue;
    }

    i += 1;
  }
  return nodes;
}

/* --------------------------------------------------------------------------
   Selector filtering and prefixing
   -------------------------------------------------------------------------- */

const classesIn = (selector) =>
  [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

const reachable = (selector) => classesIn(selector).every((c) => used.has(c));

/**
 * `.fw-scope` IS the wrapper, so it compounds onto it rather than nesting under
 * it — `.cc-root.fw-scope`, not `.cc-root .fw-scope`. Everything else nests.
 */
function prefix(selector) {
  const s = selector.trim();
  if (s === '.fw-scope') return `.${ROOT}.fw-scope`;
  if (s.startsWith('.fw-scope')) {
    const rest = s.slice('.fw-scope'.length);
    // `.fw-scope::before`, `.fw-scope.cc-anim .cc-card`, `.fw-scope *`
    return `.${ROOT}.fw-scope${rest}`;
  }
  return `.${ROOT} ${s}`;
}

const splitSelectors = (prelude) => {
  // No selector in this file contains a comma inside :not()/:is(), so a plain
  // split is safe. Asserted rather than assumed.
  if (/\((?:[^()]*,)/.test(prelude)) {
    throw new Error(`selector list needs a real parser: ${prelude}`);
  }
  return prelude.split(',').map((s) => s.trim()).filter(Boolean);
};

/* --------------------------------------------------------------------------
   Walk
   -------------------------------------------------------------------------- */

const src = readFileSync(SRC, 'utf8');
const out = [];
const keyframesSeen = new Map();
const dropped = [];

function emitRules(nodes, indent) {
  const lines = [];
  for (const node of nodes) {
    if (node.statement) continue; // bare statements only appear at top level
    if (node.prelude.startsWith('@')) {
      const name = node.prelude.split(/[\s({]/)[0];
      if (name === '@keyframes') {
        keyframesSeen.set(node.prelude.replace(/^@keyframes\s+/, '').trim(), node);
        continue;
      }
      if (name === '@media' || name === '@supports' || name === '@container') {
        const inner = emitRules(parse(node.body), `${indent}  `);
        if (inner.trim()) lines.push(`${indent}${node.prelude} {\n${inner}\n${indent}}`);
        continue;
      }
      continue;
    }
    const kept = splitSelectors(node.prelude).filter(reachable);
    if (!kept.length) {
      dropped.push(node.prelude);
      continue;
    }
    const sel = kept.map(prefix).join(',\n' + indent);
    lines.push(`${indent}${sel} {${node.body.trim() ? node.body : ''}}`);
  }
  return lines.join('\n');
}

const top = parse(src);

// @property must survive: --ck is a registered <color> so it can be
// transitioned, and .fw-scope transitions it.
for (const node of top) {
  if (node.statement && node.statement.startsWith('@property')) {
    out.push(`${node.statement};`);
  }
}
for (const node of top) {
  if (node.prelude && node.prelude.startsWith('@property')) {
    out.push(`${node.prelude} {${node.body}}`);
  }
}

const rules = emitRules(top, '');

// Only the animations the kept rules actually reference.
const referenced = new Set();
for (const [name] of keyframesSeen) {
  if (new RegExp(`animation[^;}]*\\b${name}\\b`).test(rules)) referenced.add(name);
}
for (const name of referenced) {
  const node = keyframesSeen.get(name);
  out.push(`@keyframes ${name} {${node.body}}`);
}

const header = `/* GENERATED — do not edit.
   Source:    ${SRC}
   Generator: scripts/generate-command-center-css.mjs

   The command-center deck's styles, trimmed to the rules its own markup can
   match and prefixed with .${ROOT} so they outrank the flagship homepage's
   preflight reset. See the generator for why that prefix is load-bearing. */\n`;

writeFileSync(OUT, `${header}\n${out.join('\n')}\n\n${rules}\n`);

console.log(`wrote ${OUT}`);
console.log(`  kept ${(rules.match(/\{/g) || []).length} rules, dropped ${dropped.length}`);
console.log(`  keyframes kept: ${[...referenced].join(', ') || '(none)'}`);
console.log(`  size: ${(readFileSync(OUT, 'utf8').length / 1024).toFixed(1)}KB (source ${(src.length / 1024).toFixed(1)}KB)`);
const leaked = [...(readFileSync(OUT, 'utf8').matchAll(/^(?!\s|\}|\/)([^{@\n]+)\{/gm))]
  .map((m) => m[1].trim())
  .filter((s) => !s.startsWith(`.${ROOT}`));
console.log(`  selectors not scoped to .${ROOT}: ${leaked.length}`);
if (leaked.length) console.log(leaked.slice(0, 10).join('\n'));

/* --------------------------------------------------------------------------
   The check that matters: a DROPPED rule that mentions a cc- class

   Dropping wheel rules is the point. Dropping a rule the deck needs is a
   silent visual regression — it would show up as one unstyled corner of one
   card, which is exactly the kind of thing nobody notices in a screenshot. A
   cc- selector can only be unreachable for two legitimate reasons: it belongs
   to a wheel-only mock, or its state class is applied by JS and is missing from
   the allowlist above. Anything else is a bug in this generator.
   -------------------------------------------------------------------------- */
const suspicious = [];
for (const sel of dropped.flatMap(splitSelectors)) {
  const missing = classesIn(sel).filter((c) => !used.has(c));
  if (!missing.length) continue;
  if (classesIn(sel).some((c) => c.startsWith('cc'))) {
    suspicious.push(`${sel}   [not in the deck markup: ${missing.join(', ')}]`);
  }
}
console.log(`  dropped rules mentioning a cc- class: ${suspicious.length}`);
for (const s of suspicious) console.log(`    ${s}`);
