import { getSiteContent, getTradeGlyph } from '@/lib/site-content';
import { SERVICE_ICON_PATHS } from '@/lib/templates/ServiceIcon';

// Generates a contractor's square "brand mark" — a trade-appropriate glyph on a
// rounded accent tile — as a standalone, self-contained SVG string. One source of
// truth for two uses: the published site's favicon (inlined as a data URI) and the
// downloadable logo files a contractor can reuse on trucks, invoices, and social.
// Vector only, no fonts, no external refs, so it scales and rasterizes cleanly.

export type BrandMarkVariant = 'color' | 'black' | 'white';

export const DEFAULT_BRAND_ACCENT = '#ff7a21';
const GLYPH_DARK = '#0e1622';

function safeAccent(accent: string | null | undefined): string {
  return accent && /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : DEFAULT_BRAND_ACCENT;
}

// Build the mark for a given glyph key + accent.
//   'color' — rounded accent tile with a white glyph (favicon + primary download)
//   'black' — glyph alone in dark ink, transparent tile (one-color print on light)
//   'white' — glyph alone in white, transparent tile (reversed, for dark surfaces)
export function buildBrandMarkSvg(glyphKey: string, accent: string | null | undefined, variant: BrandMarkVariant = 'color'): string {
  const inner = SERVICE_ICON_PATHS[glyphKey] ?? SERVICE_ICON_PATHS.wrench;
  const stroke = variant === 'black' ? GLYPH_DARK : '#ffffff';
  const tile = variant === 'color' ? `<rect width="64" height="64" rx="14" fill="${safeAccent(accent)}"/>` : '';
  // Glyphs are authored on a 24×24 grid; center at 1.5× (36px) inside 64×64.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    tile +
    `<g transform="translate(14 14) scale(1.5)" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>` +
    `</svg>`
  );
}

type BrandMarkSite = { content: Record<string, unknown> | null | undefined; accent_override: string | null };

// The mark for a site, inferring the glyph from its trade and using its accent.
export function siteBrandMarkSvg(site: BrandMarkSite, variant: BrandMarkVariant = 'color'): string {
  const trade = getSiteContent(site.content).trade;
  return buildBrandMarkSvg(getTradeGlyph(trade), site.accent_override, variant);
}

// Inline SVG as a data URI (for a <link rel="icon"> / Next metadata icon).
export function brandMarkDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// The `icons` block for a published site's generateMetadata — a per-site SVG
// favicon so a contractor's tab shows their trade mark, not the platform's.
export function siteIconsMetadata(site: BrandMarkSite): { icon: { url: string; type: string }[]; shortcut: { url: string; type: string }[] } {
  const url = brandMarkDataUri(siteBrandMarkSvg(site, 'color'));
  const entry = [{ url, type: 'image/svg+xml' }];
  return { icon: entry, shortcut: entry };
}
