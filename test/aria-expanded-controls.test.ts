import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * A TRIGGER THAT SAYS "EXPANDED" HAS TO SAY WHAT IT EXPANDED.
 *
 * aria-expanded on its own announces a state and names nothing. On the menus
 * and popovers in this dashboard that was 37 controls — a first scan said 27,
 * with the same broken parser that inflated the select audit in 6fe6f462, so
 * the number is re-derived here rather than trusted. The parser below is the
 * one from test/form-control-labels.test.ts, for the same two reasons:
 *
 *   1. COMMENTS. The WHY notes in this repo quote markup constantly, so
 *      "aria-expanded" turns up in prose. Blanked, preserving newlines so the
 *      line numbers reported here stay true.
 *
 *   2. A JSX TAG DOES NOT END AT THE FIRST '>'. `onClick={() => setOpen(v)}`
 *      puts one inside an attribute value, and aria-controls is very often
 *      written after the handler.
 *
 * WHY THE ATTRIBUTE IS USUALLY CONDITIONAL. Most of these popups are not
 * rendered while closed, so `aria-controls={id}` written flat would name an
 * element that is not in the document — the same dangling reference as the
 * five admin <label>s in 6fe6f462 that pointed at nothing.
 *
 * Measured in Chrome over CDP rather than assumed. Four buttons, one page:
 *
 *   target rendered and visible  -> AX node gains  controls: <target>
 *   target present but hidden    -> no controls property at all
 *   target absent from the DOM   -> no controls property at all
 *   no aria-controls attribute   -> no controls property at all
 *
 * So the relation appears only when the popup is really there, which is the
 * only moment it is any use — and a dangling reference is not read as a broken
 * relation, it is read as no relation, indistinguishable from never having
 * written the attribute. Both spellings therefore produce the same tree; the
 * conditional one is the one that is also true of the source. Where a body is
 * hidden rather than unmounted (QuickStopConfigurator, info-tip) the id is
 * always in the document and the attribute is written flat.
 *
 * Verify with `node scripts/ax-expanded-audit.mjs` — it reads the real tree,
 * not the source, for the reason recorded on 6fe6f462.
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
  return src.slice(from, from + 600);
}

/** Every JSX opening tag in a file that carries the given attribute. */
function tagsWith(src: string, attr: string): { at: number; tag: string }[] {
  const out: { at: number; tag: string }[] = [];
  for (const m of src.matchAll(/<[A-Za-z][A-Za-z0-9.]*\b/g)) {
    const tag = openingTag(src, m.index!);
    if (tag.includes(attr)) out.push({ at: m.index!, tag });
  }
  return out;
}

/**
 * The one still outstanding. Its trigger toggles an edit mode rather than
 * disclosing a region — `onClick={editing ? onSave : onEdit}` — so it needs a
 * decision about whether aria-expanded belongs on it at all, not an id. Another
 * session has the file open; left alone rather than edited underneath them.
 * Delete this entry with the fix.
 */
const KNOWN_MISSING = ['src/app/dashboard/sites/WebsiteBuilder.tsx'];

function triggersWithoutControls(): string[] {
  const bad: string[] = [];
  for (const file of FILES) {
    const src = decomment(readFileSync(file, 'utf8'));
    for (const { at, tag } of tagsWith(src, 'aria-expanded')) {
      if (tag.includes('aria-controls')) continue;
      const line = src.slice(0, at).split('\n').length;
      bad.push(`${rel(file)}:${line}`);
    }
  }
  return bad;
}

describe('every aria-expanded in the app', () => {
  it('is scanning a real set of files (a silent zero would pass)', () => {
    expect(FILES.length).toBeGreaterThan(400);
    const total = FILES.reduce(
      (n, f) => n + tagsWith(decomment(readFileSync(f, 'utf8')), 'aria-expanded').length,
      0,
    );
    expect(total).toBeGreaterThan(40);
  });

  it('names the thing it expands', () => {
    const offenders = triggersWithoutControls().filter(
      (hit) => !KNOWN_MISSING.some((known) => hit.startsWith(`${known}:`)),
    );
    expect(offenders).toEqual([]);
  });

  it('still knows about the one that is outstanding', () => {
    // So fixing it fails here and the note above gets deleted with it, rather
    // than the allowance quietly outliving the defect.
    const all = triggersWithoutControls();
    for (const known of KNOWN_MISSING) {
      expect(all.some((hit) => hit.startsWith(`${known}:`))).toBe(true);
    }
  });
});

describe('and the reference resolves', () => {
  it('every literal aria-controls="x" has an id="x" in the same file', () => {
    // Only the double-quoted literal form: a value that arrives through a prop
    // or a variable cannot be resolved by reading one file, and pretending
    // otherwise is how a guard starts reporting things that are not there.
    const bad: string[] = [];
    for (const file of FILES) {
      const src = decomment(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/aria-controls="([^"]+)"/g)) {
        for (const id of m[1].split(/\s+/)) {
          if (new RegExp(`\\bid="${esc(id)}"`).test(src)) continue;
          bad.push(`${rel(file)}:${src.slice(0, m.index!).split('\n').length} -> "${id}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every useId() named in an aria-controls is also spent on an id', () => {
    /**
     * The failure mode of the pattern this commit spreads across twenty files:
     * generate an id, point the trigger at it, and forget to put it on the
     * popup. The tree then has no relation and the source looks correct, which
     * is the worst pair — so it is checked where the mistake is made.
     */
    const bad: string[] = [];
    for (const file of FILES) {
      const src = decomment(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useId\(\)/g)) {
        const name = m[1];
        const named = tagsWith(src, 'aria-controls').some((t) =>
          new RegExp(`aria-controls=\\{[^}]*\\b${esc(name)}\\b`).test(t.tag),
        );
        if (!named) continue;
        if (new RegExp(`\\bid=\\{[^}]*\\b${esc(name)}\\b`).test(src)) continue;
        bad.push(`${rel(file)}: ${name} is pointed at but never applied`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('the parser this relies on', () => {
  it('does not mistake an arrow function for the end of a tag', () => {
    const sample = '<button aria-expanded={open} onClick={() => setOpen(!open)} aria-controls={id}>';
    expect(openingTag(sample, 0)).toContain('aria-controls');
  });

  it('does not read markup quoted in a comment', () => {
    const sample = 'a\n// was <button aria-expanded={open}> with nothing named\nb';
    expect(decomment(sample).split('\n')).toHaveLength(3);
    expect(tagsWith(decomment(sample), 'aria-expanded')).toEqual([]);
  });
});
