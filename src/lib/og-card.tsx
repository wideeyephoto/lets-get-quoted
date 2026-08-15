import { ImageResponse } from 'next/og';

/**
 * ONE SOCIAL CARD, DRAWN AT BUILD TIME, FOR THE PAGES THAT HAD NONE.
 *
 * Fifty-six public pages unfurled with no image at all: every trade page,
 * /pricing, /founder, /how-it-works and all four resource articles. None of
 * them had *forgotten* an image — each one declares its own `openGraph` block
 * to fix a worse bug (Next replaces the parent's `openGraph` object wholesale
 * rather than merging into it, so a child that declares one and omits `images`
 * drops the root layout's image on the floor). The fix for the unfurled title
 * quietly broke the unfurled picture.
 *
 * Rather than re-paste an `images` array into sixty metadata blocks — where the
 * next page to declare an `openGraph` will forget it again — each route gets an
 * `opengraph-image.tsx` that calls this. File-convention images are resolved by
 * Next AFTER `generateMetadata`, and they win, so a route wired this way cannot
 * lose its card by editing its metadata.
 *
 * WHY GENERATED AND NOT A SHARED JPEG. A single fallback would make all 49 trade
 * pages share one card, which is what a crawler reads as duplicate-ish and what
 * a contractor reads as generic. These cost nothing to make: the text is already
 * in TRADES/ARTICLES, and the render is static (see each route's
 * generateStaticParams), so they are produced once at build and served as files.
 *
 * NO CUSTOM FONT IS LOADED ON PURPOSE. next/og bundles a default sans and
 * embeds it locally; naming Space Grotesk here would mean fetching it from
 * Google at build time, so an offline or rate-limited build would fail on a
 * decorative image. The card is brand-colored rather than brand-lettered.
 */

// The palette is the marketing site's, copied rather than imported: these are
// CSS custom properties in flagship.module.css (a generated file), and satori
// resolves no variables. If the brand moves, both move.
const INK = '#07131d';
const ORANGE = '#ff6a24';
const MINT = '#50e3bd';
const CREAM = '#f5f0e7';
const MUTED = '#9db0bd';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

export type OgCard = {
  /** Small orange line above the headline — the trade, the section, the page. */
  eyebrow: string;
  /** The card's own sentence. Kept short; satori will not ellipsize for us. */
  title: string;
  /** One supporting line. Optional — the pricing card does without. */
  subtitle?: string;
  /** Bottom-right stat or reassurance, e.g. "Free to start". */
  tag?: string;
};

export function ogCard({ eyebrow, title, subtitle, tag }: OgCard): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK,
          padding: '72px 80px',
          /* A wash of the two brand lights, so the card is not a flat
             rectangle. Radial gradients rather than an image: satori
             rasterizes these, and an <img> would need a file on disk.
             `circle at <position>` and nothing else — satori's gradient
             parser rejects the explicit two-length ellipse form
             ("900px 500px at 88% -10%") with "Missing comma before color
             stops", which fails the whole image, not just the background. */
          backgroundImage:
            'radial-gradient(circle at 85% 0%, rgba(255,106,36,0.22), transparent 55%), ' +
            'radial-gradient(circle at 5% 100%, rgba(80,227,189,0.16), transparent 50%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: ORANGE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            L
          </div>
          <div
            style={{
              marginLeft: 18,
              color: CREAM,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: -0.4,
            }}
          >
            Let&apos;s Get Quoted
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              color: ORANGE,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              marginTop: 20,
              color: '#eef5f6',
              // 58px holds roughly ninety characters on three lines, which is
              // the longest title any caller passes (see the length guard in
              // marketing-seo.test.mjs).
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1.6,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 22, color: MUTED, fontSize: 27, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: MUTED, fontSize: 22 }}>letsgetquoted.com</div>
          {tag ? (
            <div
              style={{
                display: 'flex',
                border: `1px solid ${MINT}`,
                color: MINT,
                borderRadius: 999,
                padding: '10px 22px',
                fontSize: 21,
                fontWeight: 600,
              }}
            >
              {tag}
            </div>
          ) : null}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
