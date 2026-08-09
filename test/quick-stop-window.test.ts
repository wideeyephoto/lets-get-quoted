import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  quickStopOfferedPhrase,
  quickStopWindowPhrase,
  quickStopWindowShort,
} from '@/lib/quick-stop-window';
import { QUICK_STOP_DAYS_AHEAD_MAX } from '@/lib/quick-stop';

/**
 * EXPEDITED, NOT SAME-DAY.
 *
 * The product said "same-day" on nine surfaces — the master switch, the page
 * header, the explainer, two of the configurator's own field hints, the
 * marketing page, the demo, the nav rail and the customer pitch — while the
 * setting that decides it offers today only, today or tomorrow, 2 days, 3 days,
 * and up to a week.
 *
 * So an owner could choose "up to a week out" and read, on the same screen,
 * that the feature takes same-day requests. Both sentences came from the
 * product; only one of them was true of their account.
 *
 * What Quick Stops sells is a paid PRIORITY visit — sooner than the normal
 * schedule, inside a window the owner picks. "Same-day" is one setting of that,
 * not the name of it.
 */

describe('how soon, in words', () => {
  it('says the window the setting actually allows', () => {
    expect(quickStopWindowPhrase(0)).toBe('today');
    expect(quickStopWindowPhrase(1)).toBe('today or tomorrow');
    expect(quickStopWindowPhrase(2)).toBe('within 2 days');
    expect(quickStopWindowPhrase(3)).toBe('within 3 days');
    expect(quickStopWindowPhrase(7)).toBe('within a week');
  });

  /* The picker offers 0, 1, 2, 3 and 7 and nothing between, so "within 5 days"
     would sound more precise than the owner's own setting is. */
  it('rounds the gap up to a week rather than inventing a precision', () => {
    for (const days of [4, 5, 6, 7, 30]) expect(quickStopWindowPhrase(days), String(days)).toBe('within a week');
  });

  it('survives a value the database should never hold', () => {
    expect(quickStopWindowPhrase(-3)).toBe('today');
    expect(quickStopWindowPhrase(Number.NaN)).toBe('today');
    expect(quickStopWindowPhrase(1.6)).toBe('today or tomorrow');
  });

  /* "Need something fixed within 3 days?" is not a question anybody asks
     themselves. Past tomorrow, the thing they are thinking is "sooner". */
  it('drops to "sooner" where a precise window reads worse than the reason for it', () => {
    expect(quickStopWindowShort(0)).toBe('today');
    expect(quickStopWindowShort(1)).toBe('today or tomorrow');
    expect(quickStopWindowShort(2)).toBe('sooner');
    expect(quickStopWindowShort(7)).toBe('sooner');
  });

  /* Whatever the picker's ceiling is, the phrase for it has to be a real
     sentence — this fails if someone raises the max without looking here. */
  it('covers the whole range the setting can hold', () => {
    for (let days = 0; days <= QUICK_STOP_DAYS_AHEAD_MAX; days += 1) {
      expect(quickStopWindowPhrase(days), String(days)).toMatch(/^(today|today or tomorrow|within .+)$/);
    }
  });
});

/**
 * The booking page's own claim, which is a different fact from the setting.
 *
 * A Friday-evening visitor to a Mon–Fri contractor with "up to 3 days out" set
 * has today already past its last arrival time and the weekend closed, so the
 * only day on offer is Monday. The page said "today or in the next day or two"
 * there — a promise it had itself ruled out one function call earlier.
 */
describe('what the customer is actually being offered', () => {
  const day = (dateKey: string, label: string, isToday = false) => ({ dateKey, label, isToday });

  it('says today when today is the only day left', () => {
    expect(quickStopOfferedPhrase([day('2026-08-09', 'Today', true)])).toBe('today');
  });

  it('does not say "today" when today is gone', () => {
    expect(quickStopOfferedPhrase([day('2026-08-10', 'Tomorrow')])).toBe('tomorrow');
    // The Friday-evening case: Monday, and nothing before it.
    expect(quickStopOfferedPhrase([day('2026-08-12', 'Wed, Aug 12')])).toBe('on Wed, Aug 12');
  });

  it('measures the run when there is one', () => {
    expect(
      quickStopOfferedPhrase([day('2026-08-09', 'Today', true), day('2026-08-10', 'Tomorrow')]),
    ).toBe('today or tomorrow');
    expect(
      quickStopOfferedPhrase([
        day('2026-08-09', 'Today', true),
        day('2026-08-10', 'Tomorrow'),
        day('2026-08-16', 'Sun, Aug 16'),
      ]),
    ).toBe('within a week');
  });

  it('stays vague rather than wrong when the run does not start today', () => {
    expect(
      quickStopOfferedPhrase([day('2026-08-11', 'Tue, Aug 11'), day('2026-08-12', 'Wed, Aug 12')]),
    ).toBe('in the next few days');
  });

  it('never returns an empty string, whatever it is handed', () => {
    expect(quickStopOfferedPhrase([])).toBe('soon');
  });
});

/**
 * THE SWEEP, HELD.
 *
 * The point of a single helper is defeated by one more file typing the claim
 * out by hand, and that is exactly how there came to be nine of them. This
 * walks the Quick Stops surfaces and fails on a fresh one.
 */
describe('nothing claims same-day on its own account any more', () => {
  const SURFACES = [
    'src/app/dashboard/quick-stops',
    'src/app/demo/quick-stops',
    'src/app/features/quick-stops',
    'src/app/book/[subdomain]/QuickStopFlow.tsx',
    'src/components/quick-stop-panel.tsx',
    'src/components/demo-sidebar.tsx',
    'src/lib/quick-stop-pitch.ts',
    'src/lib/quick-stop-state.ts',
  ];

  const filesUnder = (rel: string): string[] => {
    const abs = join(process.cwd(), rel);
    if (!statSync(abs).isDirectory()) return [abs];
    return readdirSync(abs)
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => join(abs, name));
  };

  /** Comments are allowed to say "same-day" — they are explaining what went. */
  const prose = (source: string) =>
    source
      .replace(/\r\n/g, '\n')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('carries no "same-day" claim in anything a person reads', () => {
    const offenders: string[] = [];
    for (const surface of SURFACES) {
      for (const file of filesUnder(surface)) {
        const text = prose(readFileSync(file, 'utf8'));
        if (/same[- ]day/i.test(text)) offenders.push(file.replace(process.cwd(), '').replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  /* The nav rail's tooltip and the sidebar's are the same sentence in two
     files, and only one of them was ever remembered. */
  it('says the same thing in the rail as in the demo sidebar', () => {
    const rail = readFileSync(join(process.cwd(), 'src/components/app-shell.tsx'), 'utf8');
    const sidebar = readFileSync(join(process.cwd(), 'src/components/demo-sidebar.tsx'), 'utf8');
    const claim = 'Quick Stops is ON — nearby customers can pay to be fitted in sooner';
    expect(rail).toContain(claim);
    expect(sidebar).toContain(claim);
  });
});
