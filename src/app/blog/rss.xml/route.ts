import { generateBlogRssXml } from '@/lib/platform-blog';
import { marketingOrigin } from '@/lib/tenant-host';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const origin = marketingOrigin(rootDomain);
  const xml = await generateBlogRssXml(origin);

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
