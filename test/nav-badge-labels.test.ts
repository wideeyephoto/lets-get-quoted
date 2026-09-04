import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { navAttentionLabel } from '@/lib/nav-helpers';

/**
 * "LEADS NEW 3 12."
 *
 * That is what a screen reader read off one row of the rail: four things, three
 * of them bare digits, none of them explained. The explanations existed the
 * whole time — in `title` attributes on the <span>s holding the numbers. A
 * title on a non-interactive span is a hover tooltip. No touch device can reach
 * it, and it is not part of the accessible name, so the one place the meaning
 * was written down was the one place neither a phone nor a screen reader could
 * look.
 *
 * The counts were never wrong: leadSummary and leadRailTitle are built once on
 * the server and shared with the dashboard card so the two cannot drift. This
 * is only about which number is which.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SHELL = strip(readFileSync('src/components/app-shell.tsx', 'utf8'));

describe('navAttentionLabel', () => {
  it('names what each section is counting', () => {
    expect(navAttentionLabel('/dashboard/leads', 3)).toBe('3 website leads are waiting for a reply');
    expect(navAttentionLabel('/dashboard/jobs', 3)).toBe('3 jobs need attention');
    expect(navAttentionLabel('/dashboard/schedule', 3)).toBe('3 approved jobs have no date yet');
    expect(navAttentionLabel('/dashboard/messages', 3)).toBe('3 unread messages');
    expect(navAttentionLabel('/dashboard/text-to-job', 3)).toBe('3 field memos need review');
  });

  it('reads as English at one', () => {
    // The badge only shows above zero, so one is the number it actually spends
    // most of its time on.
    expect(navAttentionLabel('/dashboard/leads', 1)).toBe('1 website lead is waiting for a reply');
    expect(navAttentionLabel('/dashboard/jobs', 1)).toBe('1 job needs attention');
    expect(navAttentionLabel('/dashboard/schedule', 1)).toBe('1 approved job has no date yet');
    expect(navAttentionLabel('/dashboard/messages', 1)).toBe('1 unread message');
    expect(navAttentionLabel('/dashboard/text-to-job', 1)).toBe('1 field memo needs review');
  });

  it('refuses to invent a label for a count it has no definition of', () => {
    // Better a caller's fallback than a confident sentence about a number this
    // file has never been told the meaning of.
    expect(navAttentionLabel('/dashboard/clients', 4)).toBeNull();
    expect(navAttentionLabel('/dashboard', 4)).toBeNull();
  });

  it('says nothing about scheduled work being "unscheduled"', () => {
    // The count is jobs approved with no date — not every job without a date,
    // and not leads. The rail said neither.
    expect(navAttentionLabel('/dashboard/schedule', 2)).toContain('approved');
    expect(navAttentionLabel('/dashboard/schedule', 2)).toContain('no date');
  });
});

describe('a hidden label does not inherit how its container looks', () => {
  const CSS = readFileSync('src/app/globals.css', 'utf8');

  it('.sr-only cancels text-transform and letter-spacing', () => {
    /**
     * Found by measuring, not by reading. The rail's "New" pill is
     * `text-transform: uppercase`, so the sentence explaining it came out as
     * "NEW LEADS HAVE COME IN SINCE YOU LAST OPENED LEADS" — and a screen
     * reader handed a short run of capitals may spell it rather than read it.
     * Nothing inside .sr-only is ever seen, so nothing inside it should take
     * its styling from whatever it happens to be nested in.
     */
    const at = CSS.indexOf('.sr-only {');
    expect(at).toBeGreaterThan(0);
    const rule = CSS.slice(at, at + 320);
    expect(rule).toContain('text-transform: none');
    expect(rule).toContain('letter-spacing: normal');
  });
});

describe('the rail draws every badge with a label beside the digit', () => {
  it('hides the digits from the accessible name and states them instead', () => {
    for (const badge of ['sidenav-unseen', 'sidenav-count', 'sidenav-total']) {
      const at = SHELL.indexOf(`className="${badge}"`);
      expect(at, `${badge} is rendered`).toBeGreaterThan(0);
      const markup = SHELL.slice(at, at + 400);
      expect(markup, `${badge} hides its digit`).toContain('aria-hidden="true"');
      expect(markup, `${badge} carries a label`).toContain('className="sr-only"');
    }
  });

  it('takes the wording from one place', () => {
    expect(SHELL).toContain("from '@/lib/nav-helpers'");
    expect(SHELL).toContain('navAttentionLabel(href, count)');
  });

  it('does not leave a bare count anywhere in the nav', () => {
    // The exact shape that shipped: a number and nothing else.
    expect(SHELL).not.toContain('<span className="sidenav-count">{count}</span>');
    expect(SHELL).not.toContain('<span className="topnav-count">{newQuoteRequestCount}</span>');
    expect(SHELL).not.toContain('<span className="topnav-count">{jobsNeedingAttentionCount}</span>');
    expect(SHELL).not.toContain('<span className="topnav-count">{unscheduledJobCount}</span>');
  });

  it('gives the mobile top bar the same three labels, not its own', () => {
    // Two components, one rail and one top bar, drawing the same three counts.
    const at = SHELL.indexOf('className="topnav-count"');
    expect(at).toBeGreaterThan(0);
    const markup = SHELL.slice(at, at + 300);
    expect(markup).toContain('navAttentionLabel(');
    expect(markup).toContain('className="sr-only"');
  });
});
