import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * EVERY SELECT HAS A NAME A SCREEN READER CAN READ.
 *
 * The audit reported unlabelled selects across the dashboard. A first pass with
 * a naive regex said there were eighty, and almost all of them were fine —
 * sixty-odd sit inside a <label> that wraps them, which needs no htmlFor at
 * all. Two things made the count wrong, and both are worth writing down because
 * the same mistakes would make this test lie:
 *
 *   1. COMMENTS. The WHY notes in this codebase quote the markup they replaced,
 *      so "<select>" appears in prose constantly. Blanked out below, preserving
 *      length so the reported line numbers stay true.
 *
 *   2. A JSX TAG DOES NOT END AT THE FIRST '>'. `onChange={(e) => ...}` puts one
 *      inside an attribute value. Reading the tag as far as that arrow cuts off
 *      everything after it — and aria-label is usually after it. This is what
 *      turned a dozen correctly-labelled selects into "findings".
 *
 * What was actually wrong was twelve, then three once the parser was fixed:
 * five admin fields whose visible <label> pointed at nothing, one with no label
 * at all, the per-file dropdowns in the import wizard (identical to each other
 * and to a screen reader, with the filename in a table cell it could not be
 * paired with), and two site-builder fields that used a <span> where the field
 * directly between them used a <label>.
 */

const ROOTS = ['src/app', 'src/components', 'src/lib/templates'];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap(tsxFiles);
const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Blank a comment out, keeping newlines so line numbers survive. */
const blank = (s: string) => s.replace(/[^\n]/g, ' ');
const decomment = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);

/** Read an opening tag to the '>' that is outside braces and quotes. */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from, from + 400);
}

/** Every <label>…</label> range, so "is it wrapped?" is a range check. */
function labelSpans(src: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const open of src.matchAll(/<label\b[^>]*>/g)) {
    const close = src.indexOf('</label>', open.index!);
    if (close !== -1) spans.push([open.index!, close]);
  }
  return spans;
}

function unlabelledSelects(): string[] {
  const bad: string[] = [];
  for (const file of FILES) {
    const src = decomment(readFileSync(file, 'utf8'));
    const spans = labelSpans(src);
    for (const m of src.matchAll(/<select\b/g)) {
      const at = m.index!;
      const tag = openingTag(src, at);
      if (/aria-label|aria-labelledby/.test(tag)) continue;
      if (spans.some(([s, e]) => at > s && at < e)) continue;
      const id = /\bid=["{]([^"}\s]+)/.exec(tag)?.[1] ?? null;
      if (id && new RegExp(`htmlFor=["{]\\s*${esc(id)}`).test(src)) continue;
      const line = src.slice(0, at).split('\n').length;
      bad.push(`${rel(file)}:${line}`);
    }
  }
  return bad;
}

describe('every <select> in the app', () => {
  it('is scanning a real set of files (a silent zero would pass)', () => {
    expect(FILES.length).toBeGreaterThan(200);
    const total = FILES.reduce((n, f) => n + (decomment(readFileSync(f, 'utf8')).match(/<select\b/g)?.length ?? 0), 0);
    expect(total).toBeGreaterThan(100);
  });

  it('has an accessible name — from a wrapper, an htmlFor, or an aria-label', () => {
    expect(unlabelledSelects()).toEqual([]);
  });

  it('the parser does not mistake an arrow function for the end of a tag', () => {
    /**
     * The bug that inflated the first count. If openingTag stops at the '>' in
     * `(e) => ...`, this select reads as unlabelled and the whole suite starts
     * reporting findings that are not there.
     */
    const sample = '<select value={x} onChange={(e) => set(e)} aria-label="Payment method">';
    expect(openingTag(sample, 0)).toContain('aria-label');
  });

  it('the comment stripper leaves line numbers alone', () => {
    const sample = 'a\n// talk of <select> here\nb';
    expect(decomment(sample).split('\n')).toHaveLength(3);
    expect(decomment(sample)).not.toContain('<select>');
  });
});

describe('a label that points at nothing', () => {
  const ADMIN = [
    ['src/app/admin/accounts/[id]/AccountActions.tsx', 'account-plan'],
    ['src/app/admin/cases/new/page.tsx', 'case-priority'],
    ['src/app/admin/cases/[id]/CaseActions.tsx', 'case-status'],
    ['src/app/admin/quick-stops/[id]/QuickStopAdminActions.tsx', 'quick-stop-outcome'],
  ] as const;

  it.each(ADMIN)('%s pairs its visible label with the control', (path, id) => {
    // These all read correctly on screen and were inert everywhere else: no
    // accessible name, and clicking the word did not focus the field.
    const source = readFileSync(path, 'utf8');
    expect(source).toContain(`htmlFor="${id}"`);
    expect(source).toContain(`id="${id}"`);
  });
});
