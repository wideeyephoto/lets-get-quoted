import { getPlatformBlogPosts } from '@/lib/platform-blog';
import { marketingOrigin } from '@/lib/tenant-host';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const posts = await getPlatformBlogPosts({ status: 'published' });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: "Let's Get Quoted Contractor Blog",
    home_page_url: `${origin}/blog`,
    feed_url: `${origin}/blog/feed.json`,
    description:
      'Practical, no-fluff playbooks for trade contractors: cash flow, quoting, crew operations, speed-to-lead, and local SEO.',
    language: 'en-US',
    items: posts.map((post) => ({
      id: `${origin}/blog/${post.slug}`,
      url: `${origin}/blog/${post.slug}`,
      title: post.title,
      summary: post.excerpt,
      date_published: new Date(`${post.datePublished}T12:00:00Z`).toISOString(),
      ...(post.dateModified
        ? { date_modified: new Date(`${post.dateModified}T12:00:00Z`).toISOString() }
        : {}),
      authors: [
        {
          name: post.author.name,
        },
      ],
      tags: [post.category, ...post.tags],
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
