import { getSiteContent, glyphForContent } from '@/lib/site-content';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';

// Generates a contractor's square "brand mark" — a trade-appropriate glyph on a
// rounded accent tile — as a standalone, self-contained SVG string. One source of
// truth for two uses: the published site's favicon (inlined as a data URI) and the
// downloadable logo files a contractor can reuse on trucks, invoices, and social.
// Vector only, no fonts, no external refs, so it scales and rasterizes cleanly.

export type BrandMarkVariant = 'color' | 'black' | 'white' | 'accent';

export const DEFAULT_BRAND_ACCENT = '#ff7a21';
const GLYPH_DARK = '#0e1622';

function safeAccent(accent: string | null | undefined): string {
  return accent && /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : DEFAULT_BRAND_ACCENT;
}

// Build the mark for a given glyph key + accent.
//   'color'  — rounded accent tile with a white glyph (favicon + primary download)
//   'black'  — glyph alone in dark ink, transparent tile (one-color print on light)
//   'white'  — glyph alone in white, transparent tile (reversed, for dark surfaces)
//   'accent' — glyph alone in the accent color, transparent tile (transparent favicon)
export function buildBrandMarkSvg(glyphKey: string, accent: string | null | undefined, variant: BrandMarkVariant = 'color'): string {
  const glyph = SERVICE_ICON_GLYPHS[glyphKey] ?? SERVICE_ICON_GLYPHS.wrench;
  const paintColor = variant === 'black' ? GLYPH_DARK : variant === 'accent' ? safeAccent(accent) : '#ffffff';
  const tile = variant === 'color' ? `<rect width="64" height="64" rx="14" fill="${safeAccent(accent)}"/>` : '';
  // Stroke glyphs (Lucide) paint via stroke; solid-fill raw glyphs via fill.
  const paint = glyph.mode === 'fill'
    ? `fill="${paintColor}" stroke="none"`
    : `fill="none" stroke="${paintColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  // Center the glyph at ~36px inside the 64×64 tile, whatever its native grid.
  const target = 36;
  const scale = round3(target / Math.max(glyph.width, glyph.height));
  const tx = round3((64 - glyph.width * scale) / 2);
  const ty = round3((64 - glyph.height * scale) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    tile +
    `<g transform="translate(${tx} ${ty}) scale(${scale})" ${paint}>${glyph.body}</g>` +
    `</svg>`
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type BrandMarkSite = { content: Record<string, unknown> | null | undefined; accent_override: string | null };

// The mark for a site: the owner's picked glyph (or the trade default) + its accent.
export function siteBrandMarkSvg(site: BrandMarkSite, variant: BrandMarkVariant = 'color'): string {
  return buildBrandMarkSvg(glyphForContent(getSiteContent(site.content)), site.accent_override, variant);
}

// Inline SVG as a data URI (for a <link rel="icon"> / Next metadata icon).
export function brandMarkDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The `icons` block for a published site's generateMetadata — a per-site SVG
// favicon so a contractor's tab shows their trade mark, not the platform's.
export function siteIconsMetadata(site: BrandMarkSite): {
  icon: { url: string; type: string }[];
  shortcut: { url: string; type: string }[];
  apple: { url: string; sizes: string; type: string }[];
} {
  // Honor the owner's "Transparent background" choice: a tile-less, accent-
  // colored mark instead of the white-on-accent tile.
  const transparent = getSiteContent(site.content).logoStyle === 'transparent';
  const url = brandMarkDataUri(siteBrandMarkSvg(site, transparent ? 'accent' : 'color'));
  const entry = [{ url, type: 'image/svg+xml' }];
  // iOS ignores an SVG touch icon and flattens transparency to white, so the
  // home-screen icon is a separate opaque PNG (src/app/site/[subdomain]/
  // apple-icon.tsx). Absolute path on purpose: the middleware rewrites a tenant
  // host's sub-paths, so /apple-icon lands on that route for the right site.
  //
  // Declared HERE rather than left to Next's file convention, because setting
  // `icons` in generateMetadata replaces the auto-detected icons entirely —
  // the apple-icon file existed but no link was ever emitted.
  const apple = [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }];
  return { icon: entry, shortcut: entry, apple };
}
