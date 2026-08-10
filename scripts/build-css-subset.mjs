/**
 * Generate src/app/globals-lite.css — globals.css minus the rules that can only
 * ever match inside /dashboard, /admin and /demo.
 *
 * WHY A SUBSEQUENCE AND NOT A SPLIT.
 *
 * The obvious refactor — move the dashboard rules into a second stylesheet the
 * dashboard imports — does not work here, and it is worth writing down why so
 * nobody spends another day discovering it. Source order breaks ties at equal
 * specificity, and a second sheet puts everything in it AFTER everything in the
 * first. globals.css leans on that order thousands of times: `.priority-panel`
 * sets a gradient background on line 6688 and `.workspace-section-card` resets
 * it on line 10324, so the gradient has never rendered. Move `.priority-panel`
 * into a later sheet and it starts rendering.
 *
 * Measured on this file: of 3,690 rules that provably cannot match outside the
 * three app route trees, only 103 could be moved without changing which
 * declaration wins. Carrying the overriding rules along instead — transitively,
 * which is what correctness requires — closes over 88% of the file.
 *
 * So nothing moves. The app keeps the file exactly as it is, and every other
 * route gets a copy with the app-only rules deleted. Deleting a rule that
 * cannot match is behaviour-preserving by construction: the survivors keep
 * their original relative order, and the deleted ones never took part in a
 * cascade decision on those pages in the first place.
 *
 * WHAT COUNTS AS APP-ONLY. Some class in the selector must appear nowhere in
 * src/ outside src/app/dashboard, src/app/admin and src/app/demo. A selector
 * matches only when every one of its compounds matches, so one such class
 * proves the whole selector is app-only wherever the subject sits. Decided from
 * source text, never from browser coverage — coverage cannot tell a modal
 * nobody opened from a dead rule.
 *
 * /demo is in that list because it is not a mock-up: /demo/jobs renders the
 * real JobsWorkspace, /demo/insights the real InsightsScreen, and so on across
 * 33 imports from the dashboard. It imports globals.css, not the lite sheet.
 *
 * Usage:  node scripts/build-css-subset.mjs          (writes the file)
 *         node scripts/build-css-subset.mjs --check  (fails if out of date)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src/app/globals.css');
const TARGET = join(ROOT, 'src/app/globals-lite.css');
const CHECK = process.argv.includes('--check');

/** The route trees that render the product's own UI. They import globals.css. */
const APP_TREES = ['src/app/dashboard/', 'src/app/admin/', 'src/app/demo/'];

// ---------------------------------------------------------------- sources ---
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?|css|mjs|json)$/.test(entry)) sourceFiles.push(p);
  }
})(join(ROOT, 'src'));
// The generator for flagship.module.css holds class names as strings.
sourceFiles.push(join(ROOT, 'scripts/generate-flagship-css.mjs'));

const contents = new Map();
for (const f of sourceFiles) {
  if (rel(f) === 'src/app/globals.css' || rel(f) === 'src/app/globals-lite.css') continue;
  contents.set(rel(f), readFileSync(f, 'utf8'));
}

const isAppFile = (p) => APP_TREES.some((tree) => p.startsWith(tree));

// ------------------------------------------------------------------ parse ---
const css = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');

/**
 * Top-level chunks of a stylesheet, each carrying the comments and whitespace
 * that precede it so that dropping a chunk drops its explanation with it.
 */
function topLevelBlocks(text) {
  const out = [];
  let i = 0;
  let chunkStart = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i); i = e < 0 ? text.length : e + 2; continue; }
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        const c = text[j];
        if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j); j = e < 0 ? text.length : e + 2; continue; }
        if (c === '"' || c === "'") { const q = c; j++; while (j < text.length && text[j] !== q) { if (text[j] === '\\') j++; j++; } j++; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      out.push({ text: text.slice(chunkStart, j), selector: text.slice(chunkStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: text.slice(i + 1, j - 1) });
      i = j; chunkStart = j; continue;
    }
    if (ch === ';') {
      const seg = text.slice(chunkStart, i + 1);
      if (seg.replace(/\/\*[\s\S]*?\*\//g, '').trim().startsWith('@')) {
        out.push({ text: seg, selector: seg.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: '' });
        i++; chunkStart = i; continue;
      }
    }
    i++;
  }
  const tail = text.slice(chunkStart);
  if (tail.trim()) out.push({ text: tail, selector: '', body: '' });
  return out;
}

function splitSelectorList(sel) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// ------------------------------------------------------------ attribution ---
const classCache = new Map();
function isAppOnlyClass(cls) {
  if (classCache.has(cls)) return classCache.get(cls);
  const re = new RegExp(`(^|[^A-Za-z0-9_-])${cls.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^A-Za-z0-9_-]|$)`);
  let seen = false;
  let onlyApp = true;
  for (const [p, text] of contents) {
    if (!re.test(text)) continue;
    seen = true;
    if (!isAppFile(p)) { onlyApp = false; break; }
  }
  const verdict = seen && onlyApp;
  classCache.set(cls, verdict);
  return verdict;
}

/**
 * Class names assembled at runtime are invisible to a literal search, so any
 * class starting with such a prefix is treated as unattributable and kept.
 * Only template literals in a class position count — matching every hyphenated
 * string in the codebase produced sixty false prefixes and kept 128KB that did
 * not need keeping.
 */
const dynamicPrefixes = new Set();
for (const [, text] of contents) {
  for (const m of text.matchAll(/class(?:Name)?\s*=\s*[{"']?[^{"'\n]{0,80}?[`'"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*-)\$\{/gi)) dynamicPrefixes.add(m[1]);
  for (const m of text.matchAll(/classList\.(?:add|remove|toggle)\([`'"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*-)\$\{/gi)) dynamicPrefixes.add(m[1]);
}

const classesIn = (sel) => [...sel.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);

function selectorIsAppOnly(sel) {
  const classes = classesIn(sel);
  if (classes.length === 0) return false;
  for (const cls of classes) for (const prefix of dynamicPrefixes) if (cls.startsWith(prefix)) return false;
  return classes.some(isAppOnlyClass);
}

function blockIsAppOnly(block) {
  const sel = block.selector;
  if (!sel) return false;
  if (sel.startsWith('@media') || sel.startsWith('@supports')) {
    // Only when every rule inside it is. A mixed media block stays whole.
    const inner = topLevelBlocks(block.body);
    if (inner.length === 0) return false;
    return inner.every((rule) => {
      if (!rule.selector || rule.selector.startsWith('@')) return false;
      const parts = splitSelectorList(rule.selector);
      return parts.length > 0 && parts.every(selectorIsAppOnly);
    });
  }
  // Keyframes, font-face, imports and the like are cheap and hard to attribute.
  if (sel.startsWith('@')) return false;
  const parts = splitSelectorList(sel);
  return parts.length > 0 && parts.every(selectorIsAppOnly);
}

// ------------------------------------------------------------------ emit ----
const blocks = topLevelBlocks(css);
const dropped = blocks.filter(blockIsAppOnly);
const kept = blocks.filter((b) => !blockIsAppOnly(b));

const HEADER = `/* GENERATED — do not edit. Source: src/app/globals.css
   Run: node scripts/build-css-subset.mjs

   globals.css with the rules that can only match inside /dashboard, /admin and
   /demo removed. Every route except those three imports this file; they import
   globals.css itself. The rules here are in their original order and nothing
   has been rewritten, so the cascade is identical to globals.css on every page
   that loads this instead. See the script for why the dashboard rules are
   deleted from a copy rather than moved into a sheet of their own. */
`;

const out = HEADER + kept.map((b) => b.text).join('');
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

if (CHECK) {
  let current = '';
  try { current = readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n'); } catch {}
  if (current !== out) {
    console.error('globals-lite.css is out of date. Run: node scripts/build-css-subset.mjs');
    process.exit(1);
  }
  console.log(`globals-lite.css is up to date (${kb(out.length)}).`);
  process.exit(0);
}

writeFileSync(TARGET, out, 'utf8');
console.log(`globals.css      ${kb(css.length)}  ${blocks.length} blocks`);
console.log(`globals-lite.css ${kb(out.length)}  ${kept.length} blocks`);
console.log(`removed          ${kb(dropped.reduce((n, b) => n + b.text.length, 0))}  ${dropped.length} blocks (dashboard/admin/demo only)`);
