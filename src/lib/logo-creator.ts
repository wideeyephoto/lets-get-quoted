/**
 * AI Logo Creator & Vector Generator.
 *
 * Generates crisp, high-resolution, infinitely scalable vector (SVG) logos
 * for trade businesses (Plumbing, Electrical, HVAC, Roofing, Landscaping, Painting, etc.).
 *
 * Supports multiple design styles:
 * - Modern Shield / Crest Emblem
 * - Minimalist Dynamic Monogram
 * - Heritage Artisan Vintage Stamp
 * - Geometric Hexagon Tech Mark
 * - Dynamic Vector Motion
 */

import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';

export type LogoStyle =
  | 'modern_shield'
  | 'minimal_monogram'
  | 'vintage_stamp'
  | 'hexagon_badge'
  | 'dynamic_motion';

export type LogoConceptInput = {
  businessName: string;
  trade?: string | null;
  tagline?: string | null;
  establishedYear?: string | number | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  style: LogoStyle;
  iconGlyphKey?: string | null;
};

export type GeneratedLogo = {
  id: string;
  style: LogoStyle;
  styleLabel: string;
  svg: string;
  dataUri: string;
};

export const LOGO_STYLE_LABELS: Record<LogoStyle, string> = {
  modern_shield: 'Modern Shield & Crest',
  minimal_monogram: 'Minimalist Monogram',
  vintage_stamp: 'Artisan Heritage Stamp',
  hexagon_badge: 'Geometric Hexagon Badge',
  dynamic_motion: 'Dynamic Vector Mark',
};

const TRADE_GLYPH_MAP: Record<string, string> = {
  plumb: 'droplet',
  electric: 'bolt',
  hvac: 'fan',
  air: 'wind',
  heat: 'flame',
  cool: 'snowflake',
  roof: 'home',
  landscap: 'leaf',
  lawn: 'leaf',
  tree: 'tree',
  paint: 'paintbrush',
  clean: 'sparkles',
  pressure: 'droplets',
  handy: 'hammer',
  construct: 'hard-hat',
  solar: 'sun',
};

export function resolveGlyphForTrade(trade?: string | null, customGlyph?: string | null): string {
  if (customGlyph && SERVICE_ICON_GLYPHS[customGlyph]) {
    return customGlyph;
  }
  const t = (trade || '').toLowerCase();
  for (const [key, glyph] of Object.entries(TRADE_GLYPH_MAP)) {
    if (t.includes(key)) return glyph;
  }
  return 'wrench';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generates vector SVG logo concepts across various styles.
 */
export function generateLogoConcepts(
  input: Omit<LogoConceptInput, 'style'> & { styles?: LogoStyle[] }
): GeneratedLogo[] {
  const targetStyles: LogoStyle[] = input.styles || [
    'modern_shield',
    'minimal_monogram',
    'vintage_stamp',
    'hexagon_badge',
    'dynamic_motion',
  ];

  return targetStyles.map((style) => {
    const svg = generateLogoSvg({ ...input, style });
    return {
      id: `logo_${style}_${Date.now()}`,
      style,
      styleLabel: LOGO_STYLE_LABELS[style],
      svg,
      dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    };
  });
}

/**
 * Generates an ultra high-resolution, infinitely scalable SVG logo.
 */
export function generateLogoSvg(input: LogoConceptInput): string {
  const name = escapeXml(input.businessName || "Let's Get Quoted");
  const tagline = input.tagline ? escapeXml(input.tagline) : null;
  const year = input.establishedYear ? String(input.establishedYear) : '2026';
  const primary = input.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor) ? input.accentColor : '#2563eb';
  const darkInk = '#0f172a';
  const glyphKey = resolveGlyphForTrade(input.trade, input.iconGlyphKey);
  const glyph = SERVICE_ICON_GLYPHS[glyphKey] ?? SERVICE_ICON_GLYPHS.wrench;
  const initials = getInitials(input.businessName);

  switch (input.style) {
    case 'modern_shield':
      return buildModernShieldSvg({ name, tagline, primary, darkInk, glyph });
    case 'minimal_monogram':
      return buildMinimalMonogramSvg({ name, tagline, initials, primary, darkInk, glyph });
    case 'vintage_stamp':
      return buildVintageStampSvg({ name, tagline, year, primary, darkInk, glyph });
    case 'hexagon_badge':
      return buildHexagonBadgeSvg({ name, tagline, primary, darkInk, glyph });
    case 'dynamic_motion':
    default:
      return buildDynamicMotionSvg({ name, tagline, primary, darkInk, glyph });
  }
}

function buildModernShieldSvg({
  name,
  tagline,
  primary,
  darkInk,
  glyph,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" style="background: transparent;">
  <defs>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${primary}dd" />
    </linearGradient>
    <filter id="dropGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${primary}" flood-opacity="0.25" />
    </filter>
  </defs>
  <!-- Shield Emblem Icon -->
  <g transform="translate(30, 20)" filter="url(#dropGlow)">
    <path d="M 80 0 C 120 0 160 15 160 45 C 160 115 80 155 80 155 C 80 155 0 115 0 45 C 0 15 40 0 80 0 Z" fill="url(#shieldGrad)" />
    <path d="M 80 8 C 114 8 148 20 148 46 C 148 107 80 142 80 142 C 80 142 12 107 12 46 C 12 20 46 8 80 8 Z" fill="${darkInk}" opacity="0.15" />
    <g transform="translate(48, 42) scale(2.6)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>
  <!-- Business Typography -->
  <g transform="translate(225, 75)">
    <text x="0" y="25" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="${darkInk}" letter-spacing="-0.02em">${name}</text>
    ${
      tagline
        ? `<text x="0" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="${primary}" text-transform="uppercase" letter-spacing="0.15em">${tagline}</text>`
        : ''
    }
  </g>
</svg>`.trim();
}

function buildMinimalMonogramSvg({
  name,
  tagline,
  initials,
  primary,
  darkInk,
}: {
  name: string;
  tagline: string | null;
  initials: string;
  primary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" style="background: transparent;">
  <!-- Modern Geometric Monogram Icon -->
  <g transform="translate(30, 25)">
    <rect width="150" height="150" rx="30" fill="${darkInk}" />
    <rect x="8" y="8" width="134" height="134" rx="24" fill="none" stroke="${primary}" stroke-width="4" opacity="0.8" />
    <text x="75" y="102" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.05em">${initials}</text>
    <circle cx="120" cy="30" r="10" fill="${primary}" />
  </g>
  <!-- Typography -->
  <g transform="translate(215, 80)">
    <text x="0" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="800" fill="${darkInk}" letter-spacing="-0.03em">${name}</text>
    ${
      tagline
        ? `<text x="0" y="54" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748b" letter-spacing="0.08em">${tagline}</text>`
        : ''
    }
  </g>
</svg>`.trim();
}

function buildVintageStampSvg({
  name,
  tagline,
  year,
  primary,
  darkInk,
  glyph,
}: {
  name: string;
  tagline: string | null;
  year: string;
  primary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" style="background: transparent;">
  <!-- Circular Vintage Seal -->
  <g transform="translate(30, 20)">
    <circle cx="80" cy="80" r="76" fill="none" stroke="${darkInk}" stroke-width="4" />
    <circle cx="80" cy="80" r="68" fill="none" stroke="${primary}" stroke-width="2" stroke-dasharray="6,4" />
    <circle cx="80" cy="80" r="54" fill="${primary}" />
    <g transform="translate(52, 52) scale(2.3)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
    <text x="80" y="152" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="800" fill="${darkInk}" text-anchor="middle" letter-spacing="0.2em">EST. ${year}</text>
  </g>
  <!-- Typography -->
  <g transform="translate(225, 75)">
    <text x="0" y="24" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="bold" fill="${darkInk}" letter-spacing="0.02em">${name}</text>
    <line x1="0" y1="36" x2="320" y2="36" stroke="${primary}" stroke-width="2" />
    <text x="0" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="#475569" letter-spacing="0.18em" text-transform="uppercase">${tagline || 'Professional Craftsmanship'}</text>
  </g>
</svg>`.trim();
}

function buildHexagonBadgeSvg({
  name,
  tagline,
  primary,
  darkInk,
  glyph,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" style="background: transparent;">
  <!-- Hexagon Tech Badge -->
  <g transform="translate(30, 20)">
    <polygon points="80,5 155,47 155,133 80,175 5,133 5,47" fill="${darkInk}" />
    <polygon points="80,14 145,51 145,129 80,166 15,129 15,51" fill="none" stroke="${primary}" stroke-width="3.5" />
    <g transform="translate(48, 48) scale(2.6)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>
  <!-- Typography -->
  <g transform="translate(225, 75)">
    <text x="0" y="25" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="35" font-weight="900" fill="${darkInk}" letter-spacing="-0.01em">${name}</text>
    ${
      tagline
        ? `<text x="0" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="${primary}" letter-spacing="0.12em" text-transform="uppercase">${tagline}</text>`
        : ''
    }
  </g>
</svg>`.trim();
}

function buildDynamicMotionSvg({
  name,
  tagline,
  primary,
  darkInk,
  glyph,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" style="background: transparent;">
  <!-- Dynamic Angular Vector Mark -->
  <g transform="translate(30, 25)">
    <rect width="140" height="140" rx="28" fill="${primary}" transform="rotate(45 70 70) scale(0.85)" />
    <rect width="130" height="130" rx="24" fill="${darkInk}" transform="rotate(45 65 65) scale(0.75)" />
    <g transform="translate(46, 46) scale(2.4)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>
  <!-- Typography -->
  <g transform="translate(215, 78)">
    <text x="0" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" fill="${darkInk}" letter-spacing="-0.02em">${name}</text>
    ${
      tagline
        ? `<text x="0" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748b" letter-spacing="0.06em">${tagline}</text>`
        : ''
    }
  </g>
</svg>`.trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
