import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

/* EDGE, NOT NODE — and this is not a preference.
   next/og's node build resolves its bundled default font through
   fileURLToPath(), which throws "Invalid URL" during `next build` on Windows
   when the project path contains a space. Every one of these 56 images failed
   to prerender because of it. The edge build embeds the font instead of
   resolving a path to it, and edge is what the Next docs use for ImageResponse
   anyway. Nothing here touches a Node API: this card is drawn from static copy. */
export const runtime = 'edge';

export const alt = 'Your whole contracting business from $0/month — Let’s Get Quoted pricing';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: 'Your whole business · One connected system',
    title: 'Your whole contracting business. From $0/month.',
    subtitle: 'Website, quoting, booking, texting, invoices, payments, and QuickBooks sync—connected from day one.',
    tag: 'Flex · Solo · Growth · Scale',
  });
}
