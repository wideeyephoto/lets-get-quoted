import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

/* EDGE, NOT NODE — and this is not a preference.
   next/og's node build resolves its bundled default font through
   fileURLToPath(), which throws "Invalid URL" during `next build` on Windows
   when the project path contains a space. Every one of these 56 images failed
   to prerender because of it. The edge build embeds the font instead of
   resolving a path to it, and edge is what the Next docs use for ImageResponse
   anyway. Nothing here touches a Node API: this card is drawn from static copy. */
export const runtime = 'edge';

export const alt = 'Let’s Get Quoted contractor software pricing — Flex, Solo, Growth, and Scale';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: 'Pricing',
    title: 'Powerful contractor software at a surprisingly reasonable price.',
    subtitle: 'Start at $0/month with Flex. Add your own number with Solo. Reach a 0.1% LGQ platform fee with Scale.',
    tag: 'Four plans · one clear path',
  });
}
