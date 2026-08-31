import { ARTICLES, getArticle } from '@/lib/resources';
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

export const alt = 'A Let’s Get Quoted guide for contractors';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;


export default function Image({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) {
    return ogCard({ eyebrow: 'Resources', title: 'Guides for contractors', tag: 'Free to read' });
  }
  return ogCard({
    eyebrow: article.category,
    title: article.title,
    tag: `${article.readMinutes} min read`,
  });
}
