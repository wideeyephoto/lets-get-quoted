// Picks a legible text color to sit on top of an accent-colored surface
// (solid buttons, badges, call bars). The owner can override the accent to any
// hex; a fixed on-accent color then risks dark-on-dark or light-on-light. This
// returns whichever of black-ish / white has the higher WCAG contrast against
// the accent, so button text stays readable for ANY accent.
//
// Templates keep their hand-tuned default on-accent for the built-in accent and
// only fall back to this when the owner sets a custom accent — see each
// template's `--theme-on-accent`.

const DARK_TEXT = '#111';
const LIGHT_TEXT = '#fff';

// Parse #rgb / #rrggbb (with or without the leading #) to [r,g,b] 0-255.
function parseHex(input: string): [number, number, number] | null {
  const hex = input.trim().replace(/^#/, '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r, g, b].some(Number.isNaN) ? null : [r, g, b];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b].some(Number.isNaN) ? null : [r, g, b];
  }
  return null;
}

// WCAG relative luminance (0 = black, 1 = white).
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Dark text wins on accents lighter than the black/white contrast crossover
// (luminance ≈ 0.179), white text on darker ones. Matches every template's
// hand-tuned default (dark on gold/teal/green/yellow, white on red/brown).
export function readableOnAccent(
  accent: string | null | undefined,
  fallbackDark: string = DARK_TEXT,
  fallbackLight: string = LIGHT_TEXT,
): string {
  const rgb = accent ? parseHex(accent) : null;
  if (!rgb) return fallbackDark;
  return relativeLuminance(rgb) >= 0.179 ? fallbackDark : fallbackLight;
}
