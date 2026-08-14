import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * globals-lite.css — globals.css without the ~590KB of rules that can only
 * match inside /dashboard, /admin and /demo.
 *
 * WHY THIS IS SAFE, in one paragraph, because it is not obvious and the obvious
 * version of this change is wrong.
 *
 * The root layout loads the lite sheet; those three trees load the full
 * globals.css on top of it. globals.css contains every rule the lite sheet has,
 * in the same order, and comes second — so on a dashboard page the last
 * matching declaration for any element is always the one from globals.css, and
 * the cascade is bit-for-bit what it was when the root layout imported
 * globals.css for everybody. On every other page the missing rules could not
 * have matched anything, so removing them is a no-op.
 *
 * The tempting alternative — have the dashboard import only the DIFFERENCE —
 * is unsound. Source order breaks ties at equal specificity, so a rule moved
 * into a later sheet starts beating the generic rule that was written to
 * override it. Measured on this file: 3,587 of 3,690 candidate rules are in
 * exactly that position. `.priority-panel` sets a gradient on line 6688 that
 * `.workspace-section-card` resets on line 10324 — the gradient has never
 * rendered, and the naive split makes it appear.
 */

const root = process.cwd();
const APP = join(root, 'src', 'app');
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const full = read(join(APP, 'globals.css'));
const lite = read(join(APP, 'globals-lite.css'));
const rootLayout = read(join(APP, 'layout.tsx'));

const APP_TREES = ['dashboard', 'admin', 'demo'];

describe('who loads which stylesheet', () => {
  it('gives every route the lite sheet, from the root layout', () => {
    // Here rather than per-route on purpose: this layout renders the app shell
    // that every page wears, and Next does not collect global CSS imported from
    // special files, so a per-route wiring left the 404 completely unstyled.
    expect(rootLayout).toContain("import './globals-lite.css';");
    expect(rootLayout).not.toContain("import './globals.css';");
  });

  it.each(APP_TREES)('/%s adds the full sheet on top', (tree) => {
    const layout = read(join(APP, tree, 'layout.tsx'));
    expect(layout).toContain("import '../globals.css';");
    // Importing only the difference would reorder the cascade. See the header.
    // Matched as an import, not as a word — the comment above it names the file.
    expect(layout).not.toMatch(/import\s+'[^']*globals-lite\.css'/);
  });

  it('leaves every other tree alone', () => {
    // Nothing else may import either sheet: a second copy of the lite sheet is
    // dead weight, and a copy of the full one silently undoes the change.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          if (APP_TREES.includes(entry) && dir === APP) continue;
          walk(p);
        } else if (entry === 'layout.tsx' && p !== join(APP, 'layout.tsx')) {
          if (/import '.*globals(-lite)?\.css'/.test(read(p))) offenders.push(p.replace(root, ''));
        }
      }
    };
    walk(APP);
    expect(offenders).toEqual([]);
  });
});

describe('the lite sheet is a faithful subsequence of globals.css', () => {
  it('is generated, and says so', () => {
    expect(lite.startsWith('/* GENERATED')).toBe(true);
    expect(lite).toContain('scripts/build-css-subset.mjs');
  });

  it('is much smaller than the file it comes from', () => {
    // The whole point. If this approaches parity the split has stopped paying
    // for the complexity it costs.
    expect(lite.length).toBeLessThan(full.length * 0.6);
  });

  it('keeps every rule it kept in its original order', () => {
    // Being a subsequence is the safety property: survivors keep their relative
    // order, so no tie at equal specificity resolves differently.
    const body = lite.slice(lite.indexOf('*/') + 2);
    const selectors = [...body.matchAll(/(^|\n)([^\n{}@][^{}\n]{0,120}?)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(500);
    let at = 0;
    let checked = 0;
    for (const sel of selectors) {
      const spaced = full.indexOf(sel + ' {', at);
      const tight = full.indexOf(sel + '{', at);
      const next = spaced >= 0 ? spaced : tight;
      if (next < 0) continue; // formatting difference, not an order claim
      expect(next, `${sel} is out of order`).toBeGreaterThanOrEqual(at);
      at = next;
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
  });

  it('is a strict subset — it invents nothing', () => {
    // A rule present here but not in globals.css would be a rule nobody can
    // find by reading the source of truth.
    const body = lite.slice(lite.indexOf('*/') + 2);
    const selectors = [...body.matchAll(/(^|\n)([^\n{}@][^{}\n]{0,90}?)\{/g)].map((m) => m[2].trim()).filter(Boolean);
    const missing = selectors.filter((s) => !full.includes(s)).slice(0, 5);
    expect(missing).toEqual([]);
  });

  it('keeps the tokens every page needs', () => {
    // :root carries the palette. Losing it unstyles everything at once, which
    // is the one failure too big for a per-rule check to notice.
    expect(lite).toContain(':root');
    expect(lite).toContain('--font-body');
    expect(lite).toContain('--accent');
  });

  it('drops the dashboard-only rules it claims to', () => {
    // Each resolves to exactly one dashboard file. A canary per area, not a
    // list — the generator decides.
    for (const marker of ['.priority-panel', '.crew-assign-list', '.ins-shell', '.jc-top', '.statement-total-box']) {
      expect(full, marker).toContain(marker);
      expect(lite, marker).not.toContain(marker);
    }
  });

  /**
   * AND IT IS REGENERATED, which nothing checked until this was written.
   *
   * Every other assertion in this file describes the RELATIONSHIP between the
   * two sheets and all of them hold perfectly well on a lite sheet that is five
   * commits behind — a stale subsequence is still a faithful subsequence of the
   * globals.css it was built from. It just is not this one.
   *
   * That is not hypothetical. When this test was added, globals-lite.css had
   * last been generated at 468cc80d while globals.css had changed in five
   * commits since, so every public page was serving a stylesheet missing 256
   * lines — including the -webkit-backdrop-filter that is the only thing making
   * modal scrims frost on Safari, and .checkbox-row, which the generator itself
   * says is NOT dashboard-only.
   *
   * Checked by fingerprint rather than by regenerating. `--check` is the
   * authoritative answer and takes 15 seconds — it reads all of src/ to decide
   * what is app-only — which would have doubled the runtime of the entire
   * suite. The generator stamps a hash of its input into the header instead, so
   * the same question costs a hash of one file.
   */
  it('is up to date with globals.css', () => {
    const stamped = /source-sha256:\s*([0-9a-f]+)/.exec(lite)?.[1];
    expect(stamped, 'no source-sha256 in the generated header').toBeTruthy();
    // Hashed exactly as the generator reads it: utf8, newlines normalized.
    const actual = createHash('sha256').update(full).digest('hex').slice(0, 16);
    expect(stamped, 'globals-lite.css is stale — run: node scripts/build-css-subset.mjs').toBe(actual);
  });

  it('keeps what the public surfaces need', () => {
    // The booking page is the sharpest case: a public page built almost
    // entirely from the app's own primitives, so it is the likeliest to lose
    // something. (The marketing type lives in flagship.module.css, not here.)
    for (const marker of ['.book-scope', '.booking-slot', '.chrome-shell', '.form-grid', '.workspace-shell']) {
      expect(lite, marker).toContain(marker);
    }
  });
});
