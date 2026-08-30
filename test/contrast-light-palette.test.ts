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
 * Read one token out of one theme block, so a test can compare two themes
 * rather than assert two constants and hope they still mean something.
 * Anchored to the block, because --bg is declared nine times in this file.
 */
const block = (selector: string) => {
  const start = GLOBALS.indexOf(`\n${selector}`);
  if (start === -1) throw new Error(`no such theme block: ${selector}`);
  return GLOBALS.slice(start, GLOBALS.indexOf('\n}', start));
};
const token = (selector: string, name: string) => {
  const found = block(selector).match(new RegExp(`--${name}: ([^;]+);`));
  if (!found) throw new Error(`${selector} does not declare --${name}`);
  return found[1].trim();
};
const rgb = (hex: string): [number, number, number] => {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`not a six-digit hex: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};
/** HSL saturation, 0–1. The number that separates paper from tan. */
const saturation = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  if (hi === lo) return 0;
  const l = (hi + lo) / 2 / 255;
  return (hi - lo) / 255 / (l > 0.5 ? 2 - (hi + lo) / 255 : (hi + lo) / 255);
};
/** Positive is warm (red over blue), negative is cool. */
const warmth = (hex: string) => {
  const [r, , b] = rgb(hex);
  return r - b;
};
/** Relative luminance, WCAG. */
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

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
    expect(GLOBALS).toMatch(/\.ins-opp-pri\.is-high\s*\{[^}]*color:\s*var\(--ink-orange-7\);/);
    expect(GLOBALS).toMatch(/\.ins-opp-pri\.is-medium\s*\{[^}]*color:\s*var\(--ink-blue-2\);/);
    expect(GLOBALS).toMatch(/\.ins-opp-icon\.is-low\s*\{[^}]*color:\s*var\(--ink-violet-5\);/);
  });

  /** The same two literals sat on eleven chips on the same page. Fixing the
   *  badge and leaving the chips beside it would have been the odd result. */
  it('leaves no raw hue literal on any .ins-chip', () => {
    const chips = GLOBALS.match(/\.ins-chip\.is-[a-z0-9]+\s*\{[^}]*\}/g) ?? [];
    expect(chips.length).toBeGreaterThan(10);
    for (const rule of chips) {
      expect(rule).not.toMatch(/color: (#[0-9a-f]{3,6}|var\(--accent\));/);
      expect(rule).toMatch(/color:\s*var\(--ink-[a-z0-9-]+\);/);
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
    expect(GLOBALS).toContain('--ink-blue-2: #17518f;');
    expect(GLOBALS).toContain('--ink-green-13: #0f7038;');
    expect(GLOBALS).toContain('--ink-violet-5: #6d3fd6;');
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
    const block = GLOBALS.slice(GLOBALS.indexOf('.photo-default-badge,'), GLOBALS.indexOf('.photo-thumb-remove {'));
    expect(block).toMatch(/background:\s*rgba\(5,\s*10,\s*18,\s*\.72\)/);
    expect(block).toMatch(/\.photo-default-badge\s*\{[^}]*color:\s*#ffd166;/);
    expect(block).toMatch(/color:\s*rgba\(255,\s*255,\s*255,\s*\.78\)/);
    // The two tokens that flipped underneath it.
    expect(block).not.toContain('var(--gold-ink)');
    expect(block).not.toContain('rgba(var(--tint), .7)');
  });
});

describe('placeholder and schedule theme contrast', () => {
  it('ensures input placeholders use high-contrast muted tokens', () => {
    expect(GLOBALS).toContain('.field input::placeholder,');
    expect(GLOBALS).toMatch(/\.field textarea::placeholder\s*\{[^}]*color:\s*var\(--muted-2\);[^}]*opacity:\s*0\.88;/);
    expect(GLOBALS).toMatch(/\.calendar-agenda-search input::placeholder\s*\{[^}]*color:\s*var\(--muted-2\);[^}]*opacity:\s*0\.88;/);
    expect(GLOBALS).toMatch(/\.client-search-bar input::placeholder\s*\{[^}]*color:\s*var\(--muted-2\);[^}]*opacity:\s*0\.88;/);
  });

  it('ensures calendar bands support sunlight, clarity, monochrome, and parchment', () => {
    expect(GLOBALS).toContain(":root[data-theme='sunlight'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='clarity'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='monochrome'] .calendar-band-color-0");
    expect(GLOBALS).toContain(":root[data-theme='parchment'] .calendar-band-color-0");
  });

  it('ensures sunlight is daylight with a hairline border, not fog with a rule', () => {
    const SUN = ":root[data-theme='sunlight'] {";
    expect(token(SUN, 'bg')).toBe('#f4f6fa');
    expect(token(SUN, 'bg-2')).toBe('#ffffff');
    expect(token(SUN, 'text')).toBe('#0b0e14');
    expect(token(SUN, 'muted')).toBe('#48505e');
    expect(token(SUN, 'line')).toBe('#e6e9f0');
    expect(token(SUN, 'accent')).toBe('#cb4a07');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');
    expect(GLOBALS).toContain('--ink-neutral-1: #0f1a28;');
    expect(GLOBALS).toContain(':root[data-theme=\'sunlight\'] .sidenav-wordmark');

    // The ground must sit BELOW the cards or the cards stop reading as cards.
    // It used to be slate-200 with white on top, which is a lot of grey.
    expect(luminance(token(SUN, 'bg'))).toBeLessThan(luminance(token(SUN, 'bg-2')));
    expect(luminance(token(SUN, 'bg'))).toBeGreaterThan(0.8);

    // White text sits on --accent wherever it is a button fill, so the accent
    // is not free to brighten: 4.5:1 is the floor.
    const onAccent = 1.05 / (luminance(token(SUN, 'accent')) + 0.05);
    expect(onAccent).toBeGreaterThanOrEqual(4.5);
  });

  it('ensures parchment is paper, not tan', () => {
    const PAPER = ":root[data-theme='parchment'] {";
    expect(GLOBALS).toContain('color-scheme: light;');
    expect(token(PAPER, 'bg')).toBe('#f5f0e7');
    expect(token(PAPER, 'bg-2')).toBe('#fffdf9');
    expect(token(PAPER, 'text')).toBe('#241e17');
    expect(token(PAPER, 'muted')).toBe('#584f42');
    expect(token(PAPER, 'accent')).toBe('#b4530a');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');

    // Warm, obviously — but the warmth belongs to the ink and the shadow. The
    // sheet itself is barely tinted. At 0.57 it was tan; real paper is low.
    expect(warmth(token(PAPER, 'bg'))).toBeGreaterThan(0);
    expect(saturation(token(PAPER, 'bg'))).toBeLessThan(0.45);
    expect(warmth(token(PAPER, 'text'))).toBeGreaterThan(0);
    // --shade is what carries the hue into the shadows now.
    expect(token(PAPER, 'shade')).toBe('74, 58, 38');
  });

  it('ensures dim is the warm room and dark is the cool one', () => {
    const DIM = ":root[data-theme='dim'] {";
    expect(token(DIM, 'bg')).toBe('#1c1a17');
    expect(token(DIM, 'bg-2')).toBe('#24211d');
    expect(token(DIM, 'text')).toBe('#efece6');
    expect(token(DIM, 'muted')).toBe('#b0a99e');
    expect(token(DIM, 'accent')).toBe('#f97d34');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');

    // The reason Dim exists. It used to be Dark at a higher brightness, which
    // is a number, not a reason — so this asserts the temperature split and
    // the lightness one, and either regressing takes the theme's point away.
    expect(warmth(token(DIM, 'bg'))).toBeGreaterThan(0);
    expect(warmth(token(':root {', 'bg'))).toBeLessThan(0);
    expect(luminance(token(DIM, 'bg'))).toBeGreaterThan(luminance(token(':root {', 'bg')));

    // A warm ground needs a warm lift, or every edge goes blue against it.
    expect(token(DIM, 'tint')).toBe('255, 246, 235');
  });

  it('ensures every hue clarity carries is one of the Okabe-Ito eight', () => {
    const CVD = ":root[data-theme='clarity'] {";
    expect(token(CVD, 'bg')).toBe('#0b0c0e');
    expect(token(CVD, 'bg-3')).toBe('#1a1b1f');
    expect(token(CVD, 'text')).toBe('#f6f7f8');
    expect(token(CVD, 'accent')).toBe('#56b4e9');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');

    // The published set. Anything outside it has not been checked against a
    // simulator by anybody, whatever it looks like on the author's monitor.
    const OKABE_ITO = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'];
    for (const name of ['good', 'warn', 'bad', 'info', 'fresh',
      'cap-open', 'cap-light', 'cap-busy', 'cap-full', 'cap-over',
      'nav-work', 'nav-intake', 'nav-team', 'nav-money', 'nav-grow']) {
      expect(OKABE_ITO, `--${name}`).toContain(token(CVD, name));
    }

    // --good was #56b4e9, the same value as --accent, so "healthy" and "brand"
    // were one colour and the two could never be told apart.
    expect(token(CVD, 'good')).not.toBe(token(CVD, 'accent'));

    // Five rails drew in three colours for the same reason.
    const rails = ['nav-work', 'nav-intake', 'nav-team', 'nav-money', 'nav-grow']
      .map((n) => token(CVD, n));
    expect(new Set(rails).size).toBe(5);

    // The ground stays neutral: a blue canvas biases every hue judgment made
    // on top of it, which is the one thing this theme exists to avoid.
    expect(saturation(token(CVD, 'bg'))).toBeLessThan(0.15);
  });

  it('ensures monochrome separates by luminance, the only channel it has left', () => {
    const MONO = ":root[data-theme='monochrome'] {";
    expect(token(MONO, 'bg')).toBe('#0a0a0b');
    expect(token(MONO, 'bg-3')).toBe('#17171a');
    expect(token(MONO, 'text')).toBe('#fafafa');
    expect(token(MONO, 'muted')).toBe('#b4b4bb');
    expect(token(MONO, 'accent')).toBe('#fafafa');
    expect(GLOBALS).toContain('--accent-gradient: linear-gradient(180deg, var(--accent), var(--accent-end));');

    // "Pure luminance & shape" is what the picker promises, so the greys stay
    // neutral: nothing here may lean warm or cool.
    expect(token(MONO, 'tint')).toBe('255, 255, 255');
    for (const name of ['bg', 'bg-2', 'bg-3', 'good', 'warn', 'bad', 'info']) {
      expect(saturation(token(MONO, name)), `--${name}`).toBeLessThan(0.1);
    }

    // The defect this theme shipped with: --good #fafafa against --bad #ffffff
    // is a 2% luminance gap, in the one theme where luminance is all there is.
    // Every severity step now clears a visible distance from the next.
    const ramp = ['good', 'info', 'warn', 'bad'].map((n) => luminance(token(MONO, n)));
    const spread = [...ramp].sort((a, b) => a - b);
    for (let i = 1; i < spread.length; i += 1) {
      expect(spread[i] - spread[i - 1]).toBeGreaterThan(0.05);
    }
    // Attention scales with brightness: critical is the brightest thing here.
    expect(luminance(token(MONO, 'bad'))).toBe(Math.max(...ramp));
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
