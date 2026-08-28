// Picks legible text and accent colors for any surface.
//
// 1. readableOnAccent: Picks dark (#111) or light (#fff) text to sit on top of
//    an accent-colored surface (solid buttons, badges, call bars) so button
//    text always meets WCAG contrast.
//
// 2. readableAccentText: Derives an accent hex that achieves at least 4.5:1
//    contrast against the page background(s) (bg and surface) when used as
//    text/links/icons, preserving the owner's chosen hue as closely as possible.

const DARK_TEXT = '#111';
const LIGHT_TEXT = '#fff';

// Parse #rgb / #rrggbb (with or without the leading #) to [r,g,b] 0-255.
export function parseHex(input: string): [number, number, number] | null {
  if (!input || typeof input !== 'string') return null;
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
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(
  colorA: [number, number, number] | string,
  colorB: [number, number, number] | string,
): number {
  const rgbA = typeof colorA === 'string' ? parseHex(colorA) : colorA;
  const rgbB = typeof colorB === 'string' ? parseHex(colorB) : colorB;
  if (!rgbA || !rgbB) return 1;
  const l1 = relativeLuminance(rgbA);
  const l2 = relativeLuminance(rgbB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const pad = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${pad(r)}${pad(g)}${pad(b)}`.toLowerCase();
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rNorm) {
    h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
  } else if (max === gNorm) {
    h = (bNorm - rNorm) / d + 2;
  } else {
    h = (rNorm - gNorm) / d + 4;
  }
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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

// Derives a legible accent text color that achieves >= minimumContrast (default 4.5:1)
// against all provided background surfaces (e.g. [bg, surface]).
export function readableAccentText(
  accent: string | null | undefined,
  backgrounds: string | string[] = ['#ffffff'],
  minimumContrast: number = 4.5,
): string {
  const defaultFallback = '#2563eb';
  const rgb = accent ? parseHex(accent) : parseHex(defaultFallback);
  if (!rgb) return defaultFallback;

  const bgList = (Array.isArray(backgrounds) ? backgrounds : [backgrounds])
    .map((bg) => parseHex(bg))
    .filter((bg): bg is [number, number, number] => bg !== null);

  if (bgList.length === 0) return toHex(rgb);

  // 1. Test the custom accent against all backgrounds. If it already passes, return normalized hex.
  const passesAll = bgList.every((bgRgb) => getContrastRatio(rgb, bgRgb) >= minimumContrast);
  if (passesAll) return toHex(rgb);

  // 2. Determine whether backgrounds are predominantly light or dark.
  const avgBgLuminance = bgList.reduce((sum, bgRgb) => sum + relativeLuminance(bgRgb), 0) / bgList.length;
  const isLightBg = avgBgLuminance >= 0.179;

  const [h, s, l] = rgbToHsl(rgb);

  // 3. Move lightness toward black on light schemes or toward white on dark schemes.
  for (let i = 1; i <= 100; i++) {
    const t = i / 100;
    const newL = isLightBg ? Math.max(0, l - l * t) : Math.min(1, l + (1 - l) * t);
    const candidateRgb = hslToRgb([h, s, newL]);
    const passes = bgList.every((bgRgb) => getContrastRatio(candidateRgb, bgRgb) >= minimumContrast);
    if (passes) {
      return toHex(candidateRgb);
    }
  }

  // 4. Fallback if contrast target not met by shifting (e.g. low saturation on mid-grey background).
  const blackRatio = Math.min(...bgList.map((bgRgb) => getContrastRatio([0, 0, 0], bgRgb)));
  const whiteRatio = Math.min(...bgList.map((bgRgb) => getContrastRatio([255, 255, 255], bgRgb)));
  return blackRatio >= whiteRatio ? '#000000' : '#ffffff';
}
