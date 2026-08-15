import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

/**
 * EVERY SCREEN SAYS WHICH SCREEN IT IS.
 *
 * Thirty-two dashboard pages and nine demo pages exported no title, so the tab,
 * the bookmark and the history entry for all of them read whatever the nearest
 * ancestor happened to say. For the dashboard that was the root layout's
 * default — the marketing home page's sentence, "Let's Get Quoted — Contractor
 * websites that get you paid, straight to your bank" — on the page where you
 * pay your crew. For the demo it was src/app/demo/layout.tsx's "Example
 * dashboard", so nine different screens were nine identical tabs.
 *
 * A dashboard page needs nothing but the title: the root layout's
 * `template: "%s · Let's Get Quoted"` supplies the rest. Verified on
 * /account-suspended, which is the same construct in the same position and
 * renders "Account suspended · Let's Get Quoted" — the dashboard itself is
 * behind auth, so that is the closest thing to it that can be fetched.
 *
 * TWO THINGS THIS TEST HAS TO KNOW ABOUT, both learned by getting them wrong:
 *
 *   A REDIRECT HAS NO TAB. dashboard/payroll, dashboard/stripe-return and
 *   demo/campaigns are `redirect()` and nothing else. A title on one would
 *   never be read by anybody.
 *
 *   A CLIENT COMPONENT CANNOT EXPORT ONE. Next fails the build: "You are
 *   attempting to export metadata from a component marked with use client".
 *   demo/sites/page.tsx is one, and it took the dev server down with a 500
 *   until the export moved into a layout beside it. So a page may satisfy this
 *   through its own segment's layout, which is what that fix does.
 */

const ROOTS = ['src/app/dashboard', 'src/app/demo'];
const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

const PAGES = ROOTS.flatMap(pages);
const declaresTitle = (src: string) => /export const metadata|export async function generateMetadata|export function generateMetadata/.test(src);

/** A page that only redirects renders no document, so it has no tab to name. */
function isPureRedirect(src: string): boolean {
  return /\bredirect\(/.test(src) && !/\breturn\s*\(/.test(src) && !/<[A-Z]/.test(src);
}

function untitled(): string[] {
  const bad: string[] = [];
  for (const file of PAGES) {
    const src = readFileSync(file, 'utf8');
    if (isPureRedirect(src)) continue;
    if (declaresTitle(src)) continue;
    // A client page can't carry it; its segment's layout may.
    const layout = join(dirname(file), 'layout.tsx');
    if (existsSync(layout) && declaresTitle(readFileSync(layout, 'utf8'))) continue;
    bad.push(rel(file));
  }
  return bad;
}

describe('every dashboard and demo route', () => {
  it('is scanning a real set of pages (a silent zero would pass)', () => {
    expect(PAGES.length).toBeGreaterThan(60);
  });

  it('names itself in the tab', () => {
    expect(untitled()).toEqual([]);
  });

  it('does not put a title on a page that only redirects', () => {
    // The other half: these render no document, and a title on one is a claim
    // that there is a screen here to look at.
    for (const file of ['src/app/dashboard/payroll/page.tsx', 'src/app/dashboard/stripe-return/page.tsx', 'src/app/demo/campaigns/page.tsx']) {
      const src = readFileSync(file, 'utf8');
      expect(isPureRedirect(src), `${file} is no longer a bare redirect`).toBe(true);
      expect(declaresTitle(src)).toBe(false);
    }
  });

  it('never exports metadata from a client component', () => {
    /**
     * The mistake that 500'd the dev server. It is a build failure rather than
     * a quiet one, but it fails at the point of `next build` — so it is worth
     * catching in the file where it is written.
     */
    const offenders: string[] = [];
    for (const file of [...PAGES, ...ROOTS.flatMap((r) => pages(r).map((p) => join(dirname(p), 'layout.tsx')))]) {
      if (!existsSync(file)) continue;
      const src = readFileSync(file, 'utf8');
      if (/^['"]use client['"]/m.test(src) && declaresTitle(src)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });
});
