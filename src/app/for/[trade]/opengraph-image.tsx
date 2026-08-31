import { TRADES, getTrade } from '@/lib/trades';
import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

// Forty-nine of the fifty-six pages that unfurled with no image. See the note
// in src/lib/og-card.tsx for why these are generated rather than a shared JPEG.
/* EDGE, NOT NODE — and this is not a preference.
   next/og's node build resolves its bundled default font through
   fileURLToPath(), which throws "Invalid URL" during `next build` on Windows
   when the project path contains a space. Every one of these 56 images failed
   to prerender because of it. The edge build embeds the font instead of
   resolving a path to it, and edge is what the Next docs use for ImageResponse
   anyway. Nothing here touches a Node API: the cards are drawn from static data
   in lib/trades, lib/resources and lib/pricing. */
export const runtime = 'edge';

export const alt = 'Let’s Get Quoted — websites and quoting software built for your trade';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;


export default function Image({ params }: { params: { trade: string } }) {
  const trade = getTrade(params.trade);
  // A slug with no trade is a 404 on the page itself; the card still has to
  // render something rather than throw during the build.
  if (!trade) {
    return ogCard({
      eyebrow: 'For your trade',
      title: 'Contractor websites that turn requests into paid jobs.',
      tag: 'Free to start',
    });
  }
  return ogCard({
    eyebrow: `For ${trade.name}`,
    title: trade.headline,
    subtitle: trade.services.slice(0, 4).join(' · '),
    tag: 'Free to start',
  });
}
