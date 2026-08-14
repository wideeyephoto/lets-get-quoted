import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * A PANEL THAT LEAVES THE DOCUMENT HAS TO BE PUT BACK BY HAND.
 *
 * FloatingPanel renders into document.body so it escapes every scrolling and
 * overflow ancestor — the schedule modal, the day-card grids. The cost is that
 * it is then the LAST thing in the document regardless of where its trigger
 * sits, and none of the things that normally follow from being next to a button
 * are true any more:
 *
 *   TAB DOES NOT REACH IT. From the button that opened the calendar, Tab walks
 *   the rest of the page first. So opening moves focus in.
 *
 *   CLOSING STRANDS IT. Choosing a date destroys the button that had focus and
 *   focus lands on <body> — a keyboard user is returned to the top of the
 *   document every time they pick a date. So closing hands focus back to the
 *   trigger.
 *
 *   NOTHING SAYS WHAT IT IS. The panel had no role and no name, so the calendar
 *   announced as a group of buttons at the end of the document with no
 *   relationship to anything.
 *
 * Driven in a browser on both pickers, which is the only way to see any of it:
 * the panel reports role=dialog with its name, focus lands inside on open, and
 * returns to the trigger on Escape AND after choosing a value. Clicking a
 * DIFFERENT control does not pull focus back — it stays where the click went,
 * which is the condition that keeps this from being obnoxious.
 */

const PANEL = readFileSync('src/components/floating-panel.tsx', 'utf8');

const ROOTS = ['src/app', 'src/components'];
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}
const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');
const blank = (s: string) => s.replace(/[^\n]/g, ' ');
const decomment = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);

describe('FloatingPanel', () => {
  it('names the panel and lets it hold focus', () => {
    expect(PANEL).toMatch(/role=\{role\}/);
    expect(PANEL).toMatch(/aria-label=\{label\}/);
    // Needed for the case where the panel has no control of its own to hand
    // focus to; without it the focus() call silently does nothing.
    expect(PANEL).toMatch(/tabIndex=\{-1\}/);
  });

  it('moves focus in only once the panel has a real position', () => {
    /**
     * Until `placement` resolves the panel is rendered at -9999 with
     * visibility:hidden, and a hidden element cannot take focus — focusing then
     * fails silently and the user is left on the trigger. This is the bug that
     * is invisible in the source and obvious in a browser, so it is pinned
     * here.
     */
    expect(PANEL).toMatch(/if \(!placement \|\| movedFocus\.current\) return/);
  });

  it('hands focus back when it closes, and only when it was holding it', () => {
    // The condition is the point: Escape and selection both leave focus inside
    // the panel (or orphaned onto body), while clicking another control leaves
    // it on that control, which must not be stolen.
    expect(PANEL).toMatch(/active === document\.body/);
    expect(PANEL).toMatch(/anchorRef\.current\?\.focus\(\)/);
  });
});

describe('every FloatingPanel in the app', () => {
  it('says what it is, on the panel or on something inside it', () => {
    /**
     * Two callers put the role on their own inner element — the calendar's view
     * menu is a role=menu of menuitemradios — and two nested roles are worse
     * than one. So either is accepted; neither is not.
     */
    const bad: string[] = [];
    for (const file of ROOTS.flatMap(tsxFiles)) {
      const src = decomment(readFileSync(file, 'utf8'));
      if (!src.includes('<FloatingPanel')) continue;
      if (file.endsWith('floating-panel.tsx')) continue;
      for (const m of src.matchAll(/<FloatingPanel\b/g)) {
        const close = src.indexOf('</FloatingPanel>', m.index!);
        const block = src.slice(m.index!, close === -1 ? m.index! + 2000 : close);
        if (!/\brole=/.test(block)) {
          bad.push(`${rel(file)}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
