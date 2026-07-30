import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getSiteContent, glyphForContent } from '@/lib/site-content';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';
import { DEFAULT_BRAND_ACCENT } from '@/lib/brand-mark';
import { brandTilePng } from '@/lib/tile-png';

// A contractor's iOS home-screen icon.
//
// Their favicon is an SVG data URI, which iOS ignores for touch icons — it
// wants a PNG — and the SVG's tile has rounded corners, or no tile at all on
// the transparent logo style. Every transparent pixel gets flattened to WHITE
// and then masked into a white-cornered square. So this returns a real PNG
// that is opaque corner to corner; iOS rounds the corners itself.
//
// Two ways of drawing it, and the fallback is not theoretical: ImageResponse
// resolves a bundled font through fileURLToPath, which throws outright on a
// project path containing spaces — verified failing here in both dev and a
// production build. Where it works, the icon carries the real trade glyph.
// Where it doesn't, brandTilePng draws the accent tile with arithmetic. Both
// are opaque and on-brand; neither is ever white.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const NAVY = '#0e1622';

function safeAccent(accent: string | null | undefined): string {
  return accent && /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : DEFAULT_BRAND_ACCENT;
}

export default async function SiteAppleIcon({ params }: { params: { subdomain: string } }) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  const content = getSiteContent(site?.content ?? null);
  const accent = safeAccent(site?.accent_override);

  // Their favicon has two looks — a white glyph on an accent tile, or the glyph
  // in the accent colour on its own. Keep that distinction, but give the
  // transparent style a dark tile: "no tile" isn't something Apple offers, and
  // asking for it is how this ended up white in the first place.
  const transparent = content.logoStyle === 'transparent';
  const background = transparent ? NAVY : accent;
  const paint = transparent ? accent : '#ffffff';

  try {
    const glyph = SERVICE_ICON_GLYPHS[glyphForContent(content)] ?? SERVICE_ICON_GLYPHS.wrench;
    const fill = glyph.mode === 'fill';
    const box = Math.max(glyph.width, glyph.height);

    const rendered = new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background,
          }}
        >
          <svg
            width="104"
            height="104"
            viewBox={`0 0 ${box} ${box}`}
            fill={fill ? paint : 'none'}
            stroke={fill ? 'none' : paint}
            strokeWidth={fill ? undefined : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: glyph.body }}
          />
        </div>
      ),
      size,
    );
    // Buffer it here rather than returning the stream. ImageResponse's
    // constructor returns before it renders, so a failure surfaces while Next
    // is piping the body — outside any try/catch around the call, as a 500.
    // Reading it forces the render into this block, where it can be caught.
    const png = await rendered.arrayBuffer();
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    // Still a PNG, still opaque, still their colour — just a ring instead of
    // their trade glyph. Better than the white square, and better than a 500,
    // which would leave iOS falling back to the favicon that started this.
    return new Response(new Uint8Array(brandTilePng(background, paint, size.width)), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  }
}
