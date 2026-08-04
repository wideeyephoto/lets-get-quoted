import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { renderSiteAppleIcon, APPLE_ICON_SIZE, APPLE_ICON_CONTENT_TYPE } from '@/lib/site-apple-icon';

// The iOS home-screen icon on a contractor's OWN domain.
//
// siteIconsMetadata emits <link rel="apple-touch-icon" href="/apple-icon"> on
// every tenant page, but the route existed only under /site/[subdomain] — so on
// a custom domain that link 404'd and iOS fell back to the SVG favicon, which
// it flattens to a white square. Exactly the bug the icon exists to prevent,
// reintroduced by a missing file.
export const size = APPLE_ICON_SIZE;
export const contentType = APPLE_ICON_CONTENT_TYPE;

export default async function CustomDomainAppleIcon({ params }: { params: { domain: string } }) {
  const site = await getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(params.domain).toLowerCase());
  return renderSiteAppleIcon(site);
}
