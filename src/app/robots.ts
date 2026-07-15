import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${rootDomain}`;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/api/', '/pay/'] },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}