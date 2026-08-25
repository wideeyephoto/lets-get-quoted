/**
 * AI Logo Creator & Vector Generator.
 *
 * Generates crisp, high-resolution, infinitely scalable vector (SVG) logos
 * for trade businesses (Plumbing, Electrical, HVAC, Roofing, Landscaping, Painting, etc.).
 *
 * Supports rich multi-layer designs:
 * - Modern Shield & 3D Ribbon Crest
 * - Artisan Heritage Circular Seal (Curved <textPath>)
 * - Premium Split-Tone Wordmark & Architectural Frame
 * - Industrial Hexagon Gear & Machine Mark
 * - Dynamic Angular Speed Badge
 */

import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';

export type LogoStyle =
  | 'modern_shield'
  | 'vintage_stamp'
  | 'minimal_monogram'
  | 'hexagon_badge'
  | 'dynamic_motion';

export type LogoColorMode = 'color' | 'dark' | 'white_decal' | 'black_ink';

export type LogoConceptInput = {
  businessName: string;
  trade?: string | null;
  tagline?: string | null;
  establishedYear?: string | number | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  style: LogoStyle;
  iconGlyphKey?: string | null;
  colorMode?: LogoColorMode;
};

export type GeneratedLogo = {
  id: string;
  style: LogoStyle;
  styleLabel: string;
  svg: string;
  dataUri: string;
};

export const LOGO_STYLE_LABELS: Record<LogoStyle, string> = {
  modern_shield: 'Modern Crest & 3D Ribbon',
  vintage_stamp: 'Artisan Heritage Seal',
  minimal_monogram: 'Premium Split Wordmark',
  hexagon_badge: 'Industrial Hex & Gear',
  dynamic_motion: 'Dynamic Speed Badge',
};

export const CURATED_COLOR_PALETTES = [
  { name: 'Classic Navy & Gold', primary: '#1e3a8a', secondary: '#f59e0b', dark: '#0f172a' },
  { name: 'Flame Orange & Charcoal', primary: '#ea580c', secondary: '#38bdf8', dark: '#18181b' },
  { name: 'Electric Cobalt & Cyan', primary: '#2563eb', secondary: '#06b6d4', dark: '#0f172a' },
  { name: 'Forest Green & Earth', primary: '#15803d', secondary: '#d97706', dark: '#142015' },
  { name: 'Crimson & Gunmetal', primary: '#dc2626', secondary: '#fbbf24', dark: '#1e293b' },
  { name: 'Master Copper & Slate', primary: '#c2410c', secondary: '#f59e0b', dark: '#1c1917' },
  { name: 'Midnight & Neon Lime', primary: '#0f172a', secondary: '#84cc16', dark: '#090d16' },
];

const TRADE_GLYPH_MAP: Record<string, string> = {
  plumb: 'droplet',
  drain: 'droplets',
  pipe: 'wrench',
  faucet: 'faucet',
  electric: 'bolt',
  power: 'power',
  light: 'lightbulb',
  wire: 'cable',
  hvac: 'fan',
  air: 'wind',
  heat: 'flame',
  cool: 'snowflake',
  roof: 'home',
  gutter: 'droplets',
  landscap: 'leaf',
  lawn: 'leaf',
  tree: 'tree',
  pine: 'pine',
  plant: 'sprout',
  paint: 'paintbrush',
  clean: 'sparkles',
  pressure: 'droplets',
  handy: 'hammer',
  construct: 'hardhat',
  build: 'building',
  solar: 'sun',
  auto: 'truck',
  pest: 'bug',
  remodel: 'pencilRuler',
  weld: 'toolscross',
};

export function resolveGlyphForTrade(trade?: string | null, customGlyph?: string | null): string {
  if (customGlyph && SERVICE_ICON_GLYPHS[customGlyph]) {
    return customGlyph;
  }
  const t = (trade || '').toLowerCase();
  for (const [key, glyph] of Object.entries(TRADE_GLYPH_MAP)) {
    if (t.includes(key) && SERVICE_ICON_GLYPHS[glyph]) return glyph;
  }
  return 'wrench';
}

function splitBusinessName(name: string): { first: string; second: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    if (name.length > 7) {
      const mid = Math.ceil(name.length / 2);
      return { first: name.slice(0, mid), second: name.slice(mid) };
    }
    return { first: name, second: '' };
  }
  const first = parts.slice(0, Math.ceil(parts.length / 2)).join(' ');
  const second = parts.slice(Math.ceil(parts.length / 2)).join(' ');
  return { first, second };
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
    'vintage_stamp',
    'minimal_monogram',
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
  const rawName = (input.businessName || "Let's Get Quoted").trim();
  const name = escapeXml(rawName);
  const tagline = input.tagline ? escapeXml(input.tagline.trim()) : null;
  const year = input.establishedYear ? String(input.establishedYear).trim() : '2026';
  
  const mode = input.colorMode || 'color';
  let primary = input.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(input.accentColor) ? input.accentColor : '#2563eb';
  let secondary = input.secondaryColor && /^#[0-9a-fA-F]{3,8}$/.test(input.secondaryColor) ? input.secondaryColor : '#f59e0b';
  let darkInk = '#0f172a';

  if (mode === 'dark') {
    darkInk = '#ffffff';
  } else if (mode === 'white_decal') {
    primary = '#ffffff';
    secondary = '#ffffff';
    darkInk = '#ffffff';
  } else if (mode === 'black_ink') {
    primary = '#0f172a';
    secondary = '#0f172a';
    darkInk = '#0f172a';
  }

  const glyphKey = resolveGlyphForTrade(input.trade, input.iconGlyphKey);
  const glyph = SERVICE_ICON_GLYPHS[glyphKey] ?? SERVICE_ICON_GLYPHS.wrench;
  const initials = getInitials(rawName);
  const { first: splitFirst, second: splitSecond } = splitBusinessName(rawName);

  switch (input.style) {
    case 'modern_shield':
      return buildModernCrestWithRibbonSvg({ name, tagline, primary, secondary, darkInk, glyph, mode });
    case 'vintage_stamp':
      return buildCurvedHeritageSealSvg({ name, tagline, year, primary, secondary, darkInk, glyph, mode });
    case 'minimal_monogram':
      return buildSplitWordmarkSvg({ name, splitFirst, splitSecond, tagline, initials, primary, secondary, darkInk, glyph, mode });
    case 'hexagon_badge':
      return buildIndustrialGearBadgeSvg({ name, tagline, primary, secondary, darkInk, glyph, mode });
    case 'dynamic_motion':
    default:
      return buildDynamicSpeedBadgeSvg({ name, tagline, primary, secondary, darkInk, glyph, mode });
  }
}

/**
 * 1. Modern Shield & 3D Ribbon Crest
 * Features: 3D multi-bevel crest, star heraldry, 3D folded banner ribbon with shadow folds.
 */
function buildModernCrestWithRibbonSvg({
  name,
  tagline,
  primary,
  secondary,
  darkInk,
  glyph,
  mode,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  secondary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
  mode: LogoColorMode;
}) {
  const nameLen = name.length;
  const titleFontSize = nameLen > 24 ? 26 : nameLen > 18 ? 30 : 35;
  const ribbonFontSize = nameLen > 20 ? 11 : 13;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" style="background: transparent;">
  <defs>
    <linearGradient id="crestGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${primary}dd" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${secondary}" />
      <stop offset="100%" stop-color="${secondary}cc" />
    </linearGradient>
    <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${darkInk === '#ffffff' ? '#1e293b' : '#0f172a'}" />
      <stop offset="100%" stop-color="${darkInk === '#ffffff' ? '#0f172a' : '#1e293b'}" />
    </linearGradient>
    <filter id="crestShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="${mode === 'white_decal' ? '#ffffff' : primary}" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- 3D Crest & Folded Ribbon Assembly -->
  <g transform="translate(25, 15)" filter="url(#crestShadow)">
    <!-- Outer Shield Frame -->
    <path d="M 85 0 C 130 0 170 18 170 50 C 170 125 85 168 85 168 C 85 168 0 125 0 50 C 0 18 40 0 85 0 Z" fill="url(#crestGrad)" />
    <!-- Inner Bevel Outline -->
    <path d="M 85 8 C 122 8 158 24 158 52 C 158 116 85 154 85 154 C 85 154 12 116 12 52 C 12 24 48 8 85 8 Z" fill="none" stroke="${secondary}" stroke-width="2.5" opacity="0.85" />
    <!-- Inner Shield Cavity -->
    <path d="M 85 15 C 117 15 148 29 148 54 C 148 109 85 142 85 142 C 85 142 22 109 22 54 C 22 29 53 15 85 15 Z" fill="${mode === 'white_decal' ? 'none' : '#0f172a'}" opacity="${mode === 'white_decal' ? '1' : '0.25'}" />

    <!-- Heraldic Stars (3 Stars) -->
    <g fill="${secondary}" transform="translate(63, 24) scale(0.65)">
      <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
      <polygon points="34,2 37,9 44,9 39,14 41,21 34,17 27,21 29,14 24,9 31,9" transform="scale(1.25) translate(4, -4)" />
      <polygon points="56,2 59,9 66,9 61,14 63,21 56,17 49,21 51,14 46,9 53,9" />
    </g>

    <!-- Trade Glyph in Center -->
    <g transform="translate(54, 48) scale(2.6)" fill="${glyph.mode === 'fill' ? '#ffffff' : 'none'}" stroke="${glyph.mode === 'fill' ? 'none' : '#ffffff'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>

    <!-- 3D Folded Ribbon Under Shield -->
    <g transform="translate(-10, 140)">
      <!-- Left Ribbon Tail & Fold Shadow -->
      <path d="M 0 12 L 20 0 L 20 28 L 0 40 L 8 26 Z" fill="${secondary}" />
      <path d="M 20 28 L 20 40 L 32 28 Z" fill="#000000" opacity="0.45" />
      
      <!-- Right Ribbon Tail & Fold Shadow -->
      <path d="M 190 12 L 170 0 L 170 28 L 190 40 L 182 26 Z" fill="${secondary}" />
      <path d="M 170 28 L 170 40 L 158 28 Z" fill="#000000" opacity="0.45" />

      <!-- Center Ribbon Banner -->
      <rect x="18" y="4" width="154" height="26" rx="4" fill="url(#ribbonGrad)" stroke="${secondary}" stroke-width="1.5" />
      <text x="95" y="21" font-family="'Segoe UI', Roboto, -apple-system, sans-serif" font-size="${ribbonFontSize}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.18em" text-transform="uppercase">PRO MASTER</text>
    </g>
  </g>

  <!-- Business Typography (Right Side) -->
  <g transform="translate(240, 80)">
    <!-- Decorative Pre-Title Category Tag -->
    <g transform="translate(0, -18)">
      <line x1="0" y1="-5" x2="35" y2="-5" stroke="${secondary}" stroke-width="3" stroke-linecap="round" />
      <text x="45" y="0" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="${secondary}" letter-spacing="0.22em" text-transform="uppercase">CERTIFIED CONTRACTOR</text>
    </g>

    <!-- Company Name -->
    <text x="0" y="32" font-family="'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" font-size="${titleFontSize}" font-weight="900" fill="${darkInk}" letter-spacing="-0.02em">${name}</text>

    <!-- Bottom Tagline & Accent Rule -->
    ${
      tagline
        ? `
      <g transform="translate(0, 56)">
        <line x1="0" y1="2" x2="280" y2="2" stroke="${primary}" stroke-width="1.5" opacity="0.35" />
        <text x="0" y="20" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${mode === 'dark' ? '#94a3b8' : '#475569'}" letter-spacing="0.1em" text-transform="uppercase">${tagline}</text>
      </g>`
        : ''
    }
  </g>
</svg>`.trim();
}

/**
 * 2. Artisan Heritage Circular Seal (Curved <textPath>)
 * Features: Double rope circular border, arched text along top & bottom arcs, central trade sunburst medallion.
 */
function buildCurvedHeritageSealSvg({
  name,
  tagline,
  year,
  primary,
  secondary,
  darkInk,
  glyph,
  mode,
}: {
  name: string;
  tagline: string | null;
  year: string;
  primary: string;
  secondary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
  mode: LogoColorMode;
}) {
  const upperName = name.toUpperCase();
  const nameLen = upperName.length;
  const pathFontSize = nameLen > 24 ? 12 : nameLen > 18 ? 14 : 16;
  const titleFontSize = nameLen > 22 ? 28 : 34;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" style="background: transparent;">
  <defs>
    <!-- Top Arc for Business Name (Clockwise from left to right) -->
    <path id="sealTopArc" d="M 22,95 A 73,73 0 0,1 168,95" />
    <!-- Bottom Arc for Location/Established (Clockwise along lower perimeter) -->
    <path id="sealBottomArc" d="M 166,100 A 72,72 0 0,1 24,100" />
    
    <radialGradient id="sealSunburst" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${darkInk === '#ffffff' ? '#1e293b' : '#0f172a'}" />
    </radialGradient>
  </defs>

  <!-- Circular Heritage Stamp Emblem -->
  <g transform="translate(25, 15)">
    <!-- Outer Cord/Beaded Ring -->
    <circle cx="95" cy="95" r="92" fill="none" stroke="${darkInk}" stroke-width="3" />
    <circle cx="95" cy="95" r="86" fill="none" stroke="${secondary}" stroke-width="2" stroke-dasharray="4,3" />
    <circle cx="95" cy="95" r="82" fill="none" stroke="${darkInk}" stroke-width="1.5" />

    <!-- Outer Lettering Channel Background -->
    <circle cx="95" cy="95" r="80" fill="${mode === 'white_decal' ? 'none' : '#f8fafc'}" />

    <!-- Arched Text along Top Arc -->
    <text font-family="Georgia, 'Times New Roman', serif" font-size="${pathFontSize}" font-weight="900" fill="${darkInk}" letter-spacing="0.14em">
      <textPath href="#sealTopArc" startOffset="50%" text-anchor="middle">
        ${upperName}
      </textPath>
    </text>

    <!-- Arched Text along Bottom Arc -->
    <text font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" fill="${secondary}" letter-spacing="0.22em">
      <textPath href="#sealBottomArc" startOffset="50%" text-anchor="middle">
        ★ EST. ${year} ★
      </textPath>
    </text>

    <!-- Inner Medallion Frame -->
    <circle cx="95" cy="95" r="54" fill="${mode === 'white_decal' ? 'none' : 'url(#sealSunburst)'}" stroke="${secondary}" stroke-width="2.5" />
    <circle cx="95" cy="95" r="48" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3,3" opacity="0.7" />

    <!-- Trade Glyph in Medallion Center -->
    <g transform="translate(68, 68) scale(2.25)" fill="${glyph.mode === 'fill' ? '#ffffff' : 'none'}" stroke="${glyph.mode === 'fill' ? 'none' : '#ffffff'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>

  <!-- Typography (Right Side) -->
  <g transform="translate(245, 80)">
    <g transform="translate(0, -16)">
      <text x="0" y="0" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="${secondary}" letter-spacing="0.25em" text-transform="uppercase">AUTHENTIC QUALITY &bull; EST. ${year}</text>
    </g>
    <text x="0" y="32" font-family="Georgia, 'Times New Roman', serif" font-size="${titleFontSize}" font-weight="bold" fill="${darkInk}" letter-spacing="0.01em">${name}</text>
    
    <g transform="translate(0, 56)">
      <line x1="0" y1="0" x2="300" y2="0" stroke="${secondary}" stroke-width="2" />
      <text x="0" y="20" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${mode === 'dark' ? '#94a3b8' : '#475569'}" letter-spacing="0.14em" text-transform="uppercase">${tagline || 'Licensed & Insured Master Tradesman'}</text>
    </g>
  </g>
</svg>`.trim();
}

/**
 * 3. Premium Split-Tone Wordmark & Architectural Frame
 * Features: Two-tone company name styling, geometric bracket frame, initial badge plate, wide-spaced subtitle.
 */
function buildSplitWordmarkSvg({
  name,
  splitFirst,
  splitSecond,
  tagline,
  initials,
  primary,
  secondary,
  darkInk,
  glyph,
  mode,
}: {
  name: string;
  splitFirst: string;
  splitSecond: string;
  tagline: string | null;
  initials: string;
  primary: string;
  secondary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
  mode: LogoColorMode;
}) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" style="background: transparent;">
  <defs>
    <linearGradient id="monogramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${darkInk === '#ffffff' ? '#1e293b' : '#0f172a'}" />
    </linearGradient>
  </defs>

  <!-- Modern Geometric Monogram & Glyph Assembly -->
  <g transform="translate(30, 25)">
    <!-- Architectural Tile -->
    <rect width="145" height="145" rx="24" fill="url(#monogramGrad)" stroke="${secondary}" stroke-width="2" />
    <rect x="10" y="10" width="125" height="125" rx="18" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />

    <!-- Big Bold Initials -->
    <text x="72" y="78" font-family="'Segoe UI', Roboto, -apple-system, sans-serif" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.06em">${initials}</text>
    
    <!-- Secondary Badge Pill with Trade Glyph -->
    <g transform="translate(28, 92)">
      <rect width="90" height="34" rx="17" fill="${secondary}" />
      <g transform="translate(35, 7) scale(0.85)" fill="${glyph.mode === 'fill' ? '#0f172a' : 'none'}" stroke="${glyph.mode === 'fill' ? 'none' : '#0f172a'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        ${glyph.body}
      </g>
    </g>
  </g>

  <!-- Split Wordmark Typography (Right Side) -->
  <g transform="translate(215, 80)">
    <!-- Architectural Framing Bracket Lines -->
    <path d="M 0 -10 L 0 -22 L 40 -22" fill="none" stroke="${secondary}" stroke-width="3" stroke-linecap="round" />
    <text x="50" y="-14" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="800" fill="${secondary}" letter-spacing="0.22em" text-transform="uppercase">PREMIER TRADES</text>

    <!-- Two-Tone Split Wordmark -->
    <g transform="translate(0, 32)">
      ${
        splitSecond
          ? `
        <text font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" letter-spacing="-0.02em">
          <tspan fill="${primary}">${splitFirst.toUpperCase()} </tspan>
          <tspan fill="${darkInk}" font-weight="800">${splitSecond.toUpperCase()}</tspan>
        </text>`
          : `
        <text font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" fill="${primary}" letter-spacing="-0.02em">${name.toUpperCase()}</text>`
      }
    </g>

    <!-- Tagline & Bottom Architectural Bracket -->
    <g transform="translate(0, 58)">
      <text x="0" y="16" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${mode === 'dark' ? '#94a3b8' : '#64748b'}" letter-spacing="0.12em" text-transform="uppercase">${tagline || 'Residential & Commercial Specialist'}</text>
    </g>
  </g>
</svg>`.trim();
}

/**
 * 4. Industrial Hexagon Gear & Machine Mark
 * Features: Precision gear teeth, multi-layer hex plate, corner bolt fasteners, high-contrast industrial typography.
 */
function buildIndustrialGearBadgeSvg({
  name,
  tagline,
  primary,
  secondary,
  darkInk,
  glyph,
  mode,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  secondary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
  mode: LogoColorMode;
}) {
  const nameLen = name.length;
  const titleFontSize = nameLen > 24 ? 26 : nameLen > 18 ? 30 : 35;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" style="background: transparent;">
  <defs>
    <linearGradient id="gearHexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${darkInk === '#ffffff' ? '#1e293b' : '#0f172a'}" />
      <stop offset="100%" stop-color="${primary}" />
    </linearGradient>
  </defs>

  <!-- Industrial Gear & Hex Badge -->
  <g transform="translate(25, 20)">
    <!-- Outer Gear Teeth Circle -->
    <circle cx="85" cy="85" r="76" fill="none" stroke="${secondary}" stroke-width="7" stroke-dasharray="16,14" />
    
    <!-- Outer Hexagon Plate -->
    <polygon points="85,8 156,48 156,128 85,168 14,128 14,48" fill="url(#gearHexGrad)" stroke="${secondary}" stroke-width="3" />
    
    <!-- Inner Hexagon Accent Line -->
    <polygon points="85,18 146,53 146,123 85,158 24,123 24,53" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.4" />

    <!-- Corner Bolts / Rivets -->
    <circle cx="85" cy="22" r="3.5" fill="${secondary}" />
    <circle cx="142" cy="54" r="3.5" fill="${secondary}" />
    <circle cx="142" cy="122" r="3.5" fill="${secondary}" />
    <circle cx="85" cy="154" r="3.5" fill="${secondary}" />
    <circle cx="28" cy="122" r="3.5" fill="${secondary}" />
    <circle cx="28" cy="54" r="3.5" fill="${secondary}" />

    <!-- Central Trade Glyph -->
    <g transform="translate(54, 52) scale(2.6)" fill="${glyph.mode === 'fill' ? '#ffffff' : 'none'}" stroke="${glyph.mode === 'fill' ? 'none' : '#ffffff'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>

  <!-- Industrial Typography (Right Side) -->
  <g transform="translate(235, 80)">
    <!-- Top Bolt Badge -->
    <g transform="translate(0, -18)">
      <rect width="8" height="8" rx="2" fill="${secondary}" />
      <text x="16" y="8" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" fill="${secondary}" letter-spacing="0.25em" text-transform="uppercase">HEAVY DUTY TRADES</text>
    </g>

    <!-- Company Name -->
    <text x="0" y="32" font-family="'Segoe UI', Roboto, 'Arial Black', sans-serif" font-size="${titleFontSize}" font-weight="900" fill="${darkInk}" letter-spacing="-0.01em">${name.toUpperCase()}</text>

    <!-- Tagline & Industrial Rule -->
    <g transform="translate(0, 56)">
      <line x1="0" y1="0" x2="320" y2="0" stroke="${primary}" stroke-width="3" />
      <text x="0" y="20" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="${mode === 'dark' ? '#94a3b8' : '#475569'}" letter-spacing="0.14em" text-transform="uppercase">${tagline || 'Engineered Performance & Reliability'}</text>
    </g>
  </g>
</svg>`.trim();
}

/**
 * 5. Dynamic Angular Speed Badge
 * Features: Multi-faceted angular speed shield, 3D layered speed stripes, bold italicized typography.
 */
function buildDynamicSpeedBadgeSvg({
  name,
  tagline,
  primary,
  secondary,
  darkInk,
  glyph,
  mode,
}: {
  name: string;
  tagline: string | null;
  primary: string;
  secondary: string;
  darkInk: string;
  glyph: (typeof SERVICE_ICON_GLYPHS)[string];
  mode: LogoColorMode;
}) {
  const nameLen = name.length;
  const titleFontSize = nameLen > 24 ? 26 : nameLen > 18 ? 30 : 35;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="640" height="220" style="background: transparent;">
  <defs>
    <linearGradient id="speedGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${secondary}" />
    </linearGradient>
    <linearGradient id="speedGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${darkInk === '#ffffff' ? '#1e293b' : '#0f172a'}" />
      <stop offset="100%" stop-color="${primary}" />
    </linearGradient>
  </defs>

  <!-- Dynamic Angular Speed Shield Assembly -->
  <g transform="translate(30, 20)">
    <!-- Speed Trail Bars -->
    <path d="M 0 45 L 30 15 L 45 15 L 15 45 Z" fill="${secondary}" opacity="0.8" />
    <path d="M 10 75 L 40 45 L 55 45 L 25 75 Z" fill="${primary}" opacity="0.6" />
    <path d="M 20 105 L 50 75 L 65 75 L 35 105 Z" fill="${secondary}" opacity="0.4" />

    <!-- Rotated Diamond Shield Plates -->
    <rect x="25" y="10" width="130" height="130" rx="28" fill="url(#speedGrad1)" transform="rotate(45 90 75) scale(0.9)" />
    <rect x="30" y="15" width="120" height="120" rx="22" fill="url(#speedGrad2)" transform="rotate(45 90 75) scale(0.82)" stroke="#ffffff" stroke-width="1.5" />

    <!-- Centered Trade Glyph -->
    <g transform="translate(64, 48) scale(2.4)" fill="${glyph.mode === 'fill' ? '#ffffff' : 'none'}" stroke="${glyph.mode === 'fill' ? 'none' : '#ffffff'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${glyph.body}
    </g>
  </g>

  <!-- Dynamic Typography (Right Side) -->
  <g transform="translate(235, 78)">
    <g transform="translate(0, -16)">
      <polygon points="0,0 8,0 12,12 4,12" fill="${secondary}" />
      <polygon points="10,0 18,0 22,12 14,12" fill="${primary}" />
      <text x="30" y="10" font-family="'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="900" font-style="italic" fill="${secondary}" letter-spacing="0.2em" text-transform="uppercase">FAST &bull; RELIABLE &bull; PRO</text>
    </g>

    <!-- Company Name with Energetic Slant -->
    <text x="0" y="34" font-family="'Segoe UI', Roboto, sans-serif" font-size="${titleFontSize}" font-weight="900" font-style="italic" fill="${darkInk}" letter-spacing="-0.02em">${name}</text>

    <!-- Tagline & Speed Stripe -->
    <g transform="translate(0, 58)">
      <line x1="0" y1="0" x2="290" y2="0" stroke="${secondary}" stroke-width="2.5" stroke-dasharray="25,5,10,5" />
      <text x="0" y="20" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${mode === 'dark' ? '#94a3b8' : '#475569'}" letter-spacing="0.08em" text-transform="uppercase">${tagline || 'Rapid Response Trade Experts'}</text>
    </g>
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
