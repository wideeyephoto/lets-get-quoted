import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';
import { FEE_TIERS } from '@/lib/pricing';

/* EDGE, NOT NODE — and this is not a preference.
   next/og's node build resolves its bundled default font through
   fileURLToPath(), which throws "Invalid URL" during `next build` on Windows
   when the project path contains a space. Every one of these 56 images failed
   to prerender because of it. The edge build embeds the font instead of
   resolving a path to it, and edge is what the Next docs use for ImageResponse
   anyway. Nothing here touches a Node API: the cards are drawn from static data
   in lib/trades, lib/resources and lib/pricing. */
export const runtime = 'edge';

export const alt = 'Let’s Get Quoted pricing — no subscription, a platform fee only when you get paid';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  // Read off the same tier table the page renders, so the card cannot go on
  // advertising a rate the pricing page has stopped charging. FEE_TIERS is
  // ordered highest bracket rate first — the entry rate — down to the best.
  const start = FEE_TIERS[0].rate;
  const best = FEE_TIERS[FEE_TIERS.length - 1].rate;

  return ogCard({
    eyebrow: 'Pricing',
    title: 'No subscription. You pay when a homeowner pays you.',
    subtitle: `A platform fee from ${start} down to ${best} as your volume grows, plus Stripe processing.`,
    tag: 'Free to start',
  });
}
