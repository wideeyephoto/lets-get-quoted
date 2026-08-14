import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Collapsing the unscheduled-jobs rail has to give the calendar the room.
 *
 * That is the only reason the control exists — nobody hides a list they were
 * reading in order to look at the same amount of calendar. And it is a grid
 * rule rather than anything you can see from the component, so this reads the
 * stylesheet.
 *
 * WHAT WENT WRONG, and what this is really guarding. One reclaim rule served
 * every width. Below 1760 the workbench holds two items (rail, calendar) and
 * `auto minmax(0, 1fr)` was right. At 1760 a third appears — the docked detail
 * rail — and two declared tracks pushed it into an IMPLICIT ROW underneath the
 * collapsed toggle. The auto track then sized to that panel rather than to the
 * toggle, so collapsing the queue GREW its column from 340px to 456px and shoved
 * the calendar further right. Measured before the fix at 1800 and 1920.
 *
 * The invariant is therefore not "there is a reclaim rule". It is that every
 * reclaim rule declares as many tracks as the layout it lands in.
 */

const CSS = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

/** Tracks in a grid-template-columns value: `auto minmax(0, 1fr)` is two. */
const trackCount = (value: string) =>
  value
    .replace(/\([^()]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

type Rule = { minWidth: number; collapsed: boolean; tracks: number; value: string };

/**
 * Every `.schedule-workbench` grid declaration, with the min-width it sits
 * under. A brace-stack walk rather than a regex: the reclaim rules live ~180
 * lines below the base ones, so proximity proves nothing and the enclosing
 * media query is the only thing that pairs them up.
 */
function workbenchRules(): Rule[] {
  const rules: Rule[] = [];
  const stack: (number | null)[] = [];
  const token = /@media\s*\(min-width:\s*(\d+)px\)\s*\{|@[\w-]+[^{]*\{|([^{}]*?)\{([^{}]*)\}|\}/g;

  let match: RegExpExecArray | null;
  while ((match = token.exec(CSS)) !== null) {
    if (match[1] !== undefined) {
      stack.push(Number(match[1]));
      continue;
    }
    if (match[0].endsWith('{') && match[2] === undefined) {
      // Some other at-rule block (@supports, @keyframes) — track its depth.
      stack.push(null);
      continue;
    }
    if (match[0] === '}') {
      stack.pop();
      continue;
    }
    const selector = (match[2] ?? '').trim();
    if (!selector.includes('.schedule-workbench')) continue;
    const declared = /grid-template-columns:\s*([^;]+);/.exec(match[3] ?? '');
    if (!declared) continue;

    const widths = stack.filter((one): one is number => one !== null);
    rules.push({
      // 0 means "no media query" — the mobile base rule.
      minWidth: widths.length ? Math.max(...widths) : 0,
      collapsed: selector.includes(':has(.sched-queue.is-collapsed)'),
      tracks: trackCount(declared[1]),
      value: declared[1].trim(),
    });
  }
  return rules;
}

const RULES = workbenchRules();

describe('the schedule workbench grid', () => {
  it('was found at all, or every assertion below is vacuous', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(4);
    expect(RULES.some((rule) => rule.collapsed)).toBe(true);
    expect(RULES.some((rule) => !rule.collapsed)).toBe(true);
  });

  /**
   * THE ASSERTION THE BUG WOULD HAVE FAILED.
   *
   * At each breakpoint that declares a layout, the collapsed variant must
   * declare the same number of tracks. One fewer and the last grid item wraps
   * to an implicit row and drags the first column out to its width; one more
   * and an empty track eats the space being reclaimed.
   */
  it('reclaims with the same number of tracks the width lays out', () => {
    const base = RULES.filter((rule) => !rule.collapsed);
    const collapsed = RULES.filter((rule) => rule.collapsed);
    expect(collapsed.length).toBeGreaterThan(0);

    for (const rule of collapsed) {
      // The base layout in force at this width: the largest breakpoint at or
      // below it, which is how the cascade resolves it in the browser.
      const inForce = base
        .filter((one) => one.minWidth <= rule.minWidth)
        .sort((a, b) => b.minWidth - a.minWidth)[0];
      expect(inForce, `no base rule at ${rule.minWidth}px`).toBeDefined();
      expect(rule.tracks, `collapsed at ${rule.minWidth}px: "${rule.value}" vs base "${inForce.value}"`).toBe(
        inForce.tracks,
      );
    }
  });

  /* Every width that lays out a different grid needs its own reclaim rule, or
     the widest one silently inherits a narrower layout's track list — which is
     exactly how three columns became two. */
  it('has a reclaim rule for every breakpoint that changes the layout', () => {
    const laidOut = RULES.filter((rule) => !rule.collapsed && rule.minWidth >= 1280).map((rule) => rule.minWidth);
    const reclaimed = new Set(RULES.filter((rule) => rule.collapsed).map((rule) => rule.minWidth));
    for (const width of laidOut) {
      expect(reclaimed.has(width), `no reclaim rule at ${width}px`).toBe(true);
    }
  });

  /**
   * The point of the whole thing: the rail's track stops being a fixed width.
   *
   * `auto` is what lets it shrink to the toggle. A minmax() here — the shape
   * every base rule uses — would hide the list and keep its 300px anyway.
   */
  it('sizes the collapsed rail to its toggle rather than to a minimum', () => {
    for (const rule of RULES.filter((one) => one.collapsed)) {
      expect(rule.value.startsWith('auto '), `collapsed at ${rule.minWidth}px: "${rule.value}"`).toBe(true);
    }
    for (const rule of RULES.filter((one) => !one.collapsed && one.minWidth >= 1280)) {
      expect(rule.value.startsWith('minmax('), `base at ${rule.minWidth}px`).toBe(true);
    }
  });
});

describe('the collapsed rail keeps its way back', () => {
  const QUEUE = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'schedule', 'UnscheduledQueue.tsx'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  /* The panel is inerted, never the wrapper — the toggle lives in the wrapper,
     and a closed rail with no way to reopen it is a rail you have lost. */
  it('inerts the panel and not the toggle', () => {
    expect(QUEUE).toContain('const panelInert = collapsed && showCollapseToggle');
    // The ref the inert attribute is set on is the panel's, not the wrapper's.
    expect(QUEUE).toMatch(/const node = panelRef\.current;[\s\S]{0,200}panelInert/);
  });

  it('says how much is behind it while it is closed', () => {
    expect(QUEUE).toContain('${count} waiting');
    expect(QUEUE).toContain('aria-expanded={!collapsed}');
    expect(QUEUE).toContain('aria-controls="sched-queue-panel"');
  });
});
