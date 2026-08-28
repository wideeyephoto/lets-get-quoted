import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Newlines normalized, as everywhere else in this suite.
 *
 * Not cosmetic here: "sits after .workspace-section-card" searches for a
 * literal `{\n  background:`, so on a CRLF checkout — which is what git hands
 * you on Windows with core.autocrlf, and what `git stash pop` leaves behind —
 * it found nothing and reported the rule as missing rather than misplaced.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const GLOBALS = read('src', 'app', 'globals.css');
const BANNER = read('src', 'app', 'dashboard', 'BlogReminderBanner.tsx');

/**
 * Three surfaces the schedule pass measured and left alone, all failing AA in
 * the LIGHT theme only. Each is the same shape of mistake — a colour decided
 * against the dark canvas and then asked to stand on a white sheet — and each
 * fails a different way.
 */

describe('the blog reminder card', () => {
  /**
   * `background: rgba(245, 166, 35, 0.06)` inline is a SHORTHAND. It did not
   * tint the panel, it replaced the panel's fill — and behind a panel is the
   * app canvas, which in the light theme is a dark slab that every other card
   * hides under its own opaque white. Measured on /dashboard in light:
   * heading 1.29:1, body 1.19:1, eyebrow 1.96:1, both buttons under 2:1.
   */
  it('does not set its own background from the component', () => {
    expect(BANNER).not.toContain("background: 'rgba(245, 166, 35, 0.06)'");
    expect(BANNER).not.toContain('style={{ borderColor');
    expect(BANNER).toContain('className="panel workspace-section-card blog-reminder-card"');
  });

  /** The topic gradient was five inline declarations; there is nothing left to
   *  set inline, so the whole style object goes with them. */
  it('has no inline style objects left', () => {
    expect(BANNER).not.toContain('const topicStyle');
    expect(BANNER).not.toContain('style={topicStyle}');
    expect(BANNER).toContain('className="blog-reminder-topic"');
  });

  /**
   * `:root[data-theme='light'] .panel { background: #ffffff }` is (0,3,0). A
   * bare `.blog-reminder-card` is (0,1,0) and lost — the shorthand reset
   * background-image to none and the tint measured as simply absent, wherever
   * in the file it was written. This selector matches that weight and wins on
   * source order, which is the only reason it carries :root at all.
   */
  it('is weighted to survive the light theme’s own panel rule', () => {
    expect(GLOBALS).toContain(':root[data-theme] .blog-reminder-card {');
    expect(GLOBALS).toContain('background-image: linear-gradient(rgba(245, 166, 35, 0.06), rgba(245, 166, 35, 0.06));');
    // background-image, never the shorthand: the tint has to ride on whatever
    // fill the card already resolves to rather than carry a second copy of it.
    const block = GLOBALS.slice(GLOBALS.indexOf(':root[data-theme] .blog-reminder-card {'), GLOBALS.indexOf('.blog-reminder-eyebrow'));
    expect(block).not.toMatch(/\n\s*background:/);
  });

  /** And after the rule whose shorthand would erase it. */
  it('sits after .workspace-section-card', () => {
    const base = GLOBALS.indexOf('.workspace-section-card {\n  background: var(--bg-elevated);');
    const tint = GLOBALS.indexOf(':root[data-theme] .blog-reminder-card {');
    expect(base).toBeGreaterThan(0);
    expect(tint).toBeGreaterThan(base);
  });

  /**
   * The four gradient stops were raw literals picked on the canvas, and three
   * of the four failed there too — #ef4444 4.15:1, #3b82f6 4.25:1, #a855f7
   * 3.95:1 at 16.32px, bold but under the 18.66px that would let 3:1 apply.
   * The tokens carry the same four hues and flip with the theme.
   */
  it('builds the topic gradient from ink tokens, not literals', () => {
    expect(GLOBALS).toContain('linear-gradient(92deg, var(--ink-orange-5) 0%, var(--ink-red-3) 40%, var(--ink-violet-1) 75%, var(--ink-blue) 100%)');
    for (const dead of ['#f59e0b 0%', '#ef4444 40%', '#a855f7 75%', '#3b82f6 100%']) {
      expect(BANNER).not.toContain(dead);
    }
  });
});

describe('the Insights priority badges', () => {
  /**
   * Each badge pairs a tinted pill with a matching ink, and the tint is an rgba
   * of the DARK theme's hue — so on paper the pill lightened and the ink stayed.
   * "Do first" measured 2.12:1, "Worth doing" 1.96:1, and the eleven .ins-chip
   * glyphs beside them 1.60–2.36:1. Colour is the whole signal on a badge that
   * says one word.
   */
  it('inks the badges with tokens that flip', () => {
    expect(GLOBALS).toContain('.ins-opp-pri.is-high { color: var(--ink-orange-7);');
    expect(GLOBALS).toContain('.ins-opp-pri.is-medium { color: var(--ink-blue-2);');
    expect(GLOBALS).toContain('.ins-opp-icon.is-low { color: var(--ink-violet-5);');
  });

  /** The same two literals sat on eleven chips on the same page. Fixing the
   *  badge and leaving the chips beside it would have been the odd result. */
  it('leaves no raw hue literal on any .ins-chip', () => {
    const chips = GLOBALS.match(/^\.ins-chip\.is-[a-z0-9]+ \{.*$/gm) ?? [];
    expect(chips.length).toBeGreaterThan(10);
    for (const rule of chips) {
      expect(rule).not.toMatch(/color: (#[0-9a-f]{3,6}|var\(--accent\));/);
      expect(rule).toMatch(/color: var\(--ink-[a-z0-9-]+\);/);
    }
  });

  /**
   * Each new token's DARK value is the literal it replaced, which is what makes
   * this a no-op on the canvas and a real change on the sheet.
   */
  it('defines the new tokens in both palettes, dark value unchanged', () => {
    expect(GLOBALS).toContain('--ink-blue-2: #6aa8ee;');
    expect(GLOBALS).toContain('--ink-green-13: #4ade80;');
    expect(GLOBALS).toContain('--ink-violet-5: #a78bfa;');
    expect(GLOBALS).toContain('--ink-blue-2: #17518f;  /* was #6aa8ee */');
    expect(GLOBALS).toContain('--ink-green-13: #0f7038;  /* was #4ade80 */');
    expect(GLOBALS).toContain('--ink-violet-5: #6d3fd6;  /* was #a78bfa */');
  });
});

describe('the photo overlay labels', () => {
  /**
   * The pill floats on a photograph, so its fill is a near-black literal in
   * BOTH themes — the only backdrop that reads over an arbitrary image. The ink
   * was themed, so on paper it flipped to paper values and put dark text on a
   * dark pill: "Default image" 1.21:1, "Drag" 1.72:1.
   */
  it('pins its ink the way its background is pinned', () => {
    const block = GLOBALS.slice(GLOBALS.indexOf('.photo-default-badge, .photo-drag-handle, .photo-make-default {'), GLOBALS.indexOf('.photo-thumb-remove {'));
    expect(block).toContain('background: rgba(5,10,18,.72)');
    expect(block).toContain('.photo-default-badge { top: .5rem; left: .5rem; padding: .24rem .5rem; color: #ffd166;');
    expect(block).toContain('color: rgba(255,255,255,.78)');
    // The two tokens that flipped underneath it.
    expect(block).not.toContain('var(--gold-ink)');
    expect(block).not.toContain('rgba(var(--tint), .7)');
  });
});

describe('placeholder and schedule theme contrast', () => {
  it('ensures input placeholders use high-contrast muted tokens', () => {
    expect(GLOBALS).toContain('.field input::placeholder,');
    expect(GLOBALS).toContain('.field textarea::placeholder { color: var(--muted-2); opacity: 0.88; }');
    expect(GLOBALS).toContain('.calendar-agenda-search input::placeholder { color: var(--muted-2); opacity: 0.88; }');
    expect(GLOBALS).toContain('.client-search-bar input::placeholder { color: var(--muted-2); opacity: 0.88; }');
  });

  it('ensures calendar bands support sunlight, clarity, monochrome, and parchment', () => {
    expect(GLOBALS).toContain(":root[data-theme='sunlight'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='clarity'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='monochrome'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='parchment'] .calendar-band-color-0");
  });

  it('ensures sunlight mode has daylight slate background and soft #cbd5e1 borders', () => {
    expect(GLOBALS).toContain(":root[data-theme='sunlight'] {");
    expect(GLOBALS).toContain('--bg: #eef2f6;');
    expect(GLOBALS).toContain('--text: #0f172a;');
    expect(GLOBALS).toContain('--muted: #475569;');
    expect(GLOBALS).toContain('--line: #cbd5e1;');
    expect(GLOBALS).toContain('--accent: #c94f00;');
    expect(GLOBALS).toContain('--accent-end: #e66a19;');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
    expect(GLOBALS).toContain('--ink-neutral-1: #0f1a28;');
    expect(GLOBALS).toContain('--ink-orange-1: #a0531a;');
    expect(GLOBALS).toContain(':root[data-theme=\'sunlight\'] .sidenav-wordmark');
  });

  it('ensures parchment mode is a genuine warm paper light theme', () => {
    expect(GLOBALS).toContain(":root[data-theme='parchment'] {");
    expect(GLOBALS).toContain('color-scheme: light;');
    expect(GLOBALS).toContain('--bg: #f1e4cc;');
    expect(GLOBALS).toContain('--bg-2: #fff7e6;');
    expect(GLOBALS).toContain('--text: #30261b;');
    expect(GLOBALS).toContain('--muted: #6b5b49;');
    expect(GLOBALS).toContain('--accent: #a84c00;');
    expect(GLOBALS).toContain('--accent-end: #d97706;');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
  });

  it('ensures dim mode is lighter and less blue than dark', () => {
    expect(GLOBALS).toContain(":root[data-theme='dim'] {");
    expect(GLOBALS).toContain('--bg: #1a2430;');
    expect(GLOBALS).toContain('--bg-2: #243140;');
    expect(GLOBALS).toContain('--text: #e8edf3;');
    expect(GLOBALS).toContain('--muted: #aab6c4;');
    expect(GLOBALS).toContain('--accent: #e97830;');
    expect(GLOBALS).toContain('--accent-end: #f59e66;');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
  });

  it('ensures clarity uses CVD-safe Okabe-Ito system consistently without orange/green', () => {
    expect(GLOBALS).toContain(":root[data-theme='clarity'] {");
    expect(GLOBALS).toContain('--bg: #08131f;');
    expect(GLOBALS).toContain('--bg-3: #102033;');
    expect(GLOBALS).toContain('--text: #f8fafc;');
    expect(GLOBALS).toContain('--accent: #56b4e9;');
    expect(GLOBALS).toContain('--accent-end: #8ecdf0;');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
    expect(GLOBALS).toContain('--warn: #f0e442;');
    expect(GLOBALS).toContain('--bad: #ff6b4a;');
    expect(GLOBALS).toContain('--info: #cc79a7;');
  });

  it('ensures monochrome uses pure grayscale ramps', () => {
    expect(GLOBALS).toContain(":root[data-theme='monochrome'] {");
    expect(GLOBALS).toContain('--bg: #0b0b0c;');
    expect(GLOBALS).toContain('--bg-3: #18181b;');
    expect(GLOBALS).toContain('--text: #fafafa;');
    expect(GLOBALS).toContain('--muted: #bfc0c7;');
    expect(GLOBALS).toContain('--accent: #f4f4f5;');
    expect(GLOBALS).toContain('--accent-end: #a1a1aa;');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
  });

  it('ensures all primary action gradients are configured per theme', () => {
    expect(GLOBALS).toContain('.sidenav-new {');
    expect(GLOBALS).toContain('background: var(--accent-gradient, linear-gradient(180deg, var(--accent), var(--accent-2)));');
    expect(GLOBALS).toContain('.settings-tab.active {');
    expect(GLOBALS).toContain('.es-day-chip.is-on {');
  });

  it('ensures semantic tokens are defined and properly neutralized/remapped in mono and clarity', () => {
    expect(GLOBALS).toContain('--ambient-glow:');
    expect(GLOBALS).toContain('--planning: #7c3aed;');
    expect(GLOBALS).toContain('--planning: #cc79a7;');
    expect(GLOBALS).toContain('--planning: #71717a;');
    expect(GLOBALS).toContain('--assistant-accent: linear-gradient(135deg, #7c3aed 0%, #ec4899 55%, #f59e0b 100%);');
    expect(GLOBALS).toContain('--assistant-accent: linear-gradient(135deg, #56b4e9 0%, #cc79a7 55%, #f0e442 100%);');
    expect(GLOBALS).toContain('--assistant-accent: linear-gradient(135deg, #f4f4f5 0%, #a1a1aa 55%, #52525b 100%);');
    expect(GLOBALS).toContain('.action-btn--plan {');
    expect(GLOBALS).toContain('border-color: var(--planning');
    expect(GLOBALS).toContain('.website-nav-badge {');
    expect(GLOBALS).toContain('background: var(--assistant-accent');
  });
});

