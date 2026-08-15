import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

/* EDGE, NOT NODE — and this is not a preference.
   next/og's node build resolves its bundled default font through
   fileURLToPath(), which throws "Invalid URL" during `next build` on Windows
   when the project path contains a space. Every one of these 56 images failed
   to prerender because of it. The edge build embeds the font instead of
   resolving a path to it, and edge is what the Next docs use for ImageResponse
   anyway. Nothing here touches a Node API: the cards are drawn from static data
   in lib/trades, lib/resources and lib/pricing. */
export const runtime = 'edge';

export const alt = 'Why I built Let’s Get Quoted';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: 'Founder',
    title: 'Why I built Let’s Get Quoted.',
    subtitle: 'One person, building the tool the trades were owed — in public.',
  });
}
