import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { renderSiteAppleIcon, APPLE_ICON_SIZE, APPLE_ICON_CONTENT_TYPE } from '@/lib/site-apple-icon';

// See lib/site-apple-icon.tsx for why this is a PNG and what it is guarding
// against. The drawing lives there so the custom-domain tree serves the exact
// same icon.
export const size = APPLE_ICON_SIZE;
export const contentType = APPLE_ICON_CONTENT_TYPE;

export default async function SiteAppleIcon({ params }: { params: { subdomain: string } }) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  return renderSiteAppleIcon(site);
}
