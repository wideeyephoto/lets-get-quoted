import { requireOwnerContext } from '@/lib/auth';
import { listUploadedSiteImages } from '@/lib/site-image-storage';
import { getOrCreateSite } from '@/lib/sites';
import WebsiteBuilder from './WebsiteBuilder';

export const metadata = {
  title: 'Website Settings',
  description: 'Customize your contractor website',
};

export default async function SitesPage() {
  const { supabase, accountId } = await requireOwnerContext();

  // Get or create site
  const site = await getOrCreateSite(supabase, accountId);
  const uploadedImages = await listUploadedSiteImages(accountId);

  return <WebsiteBuilder site={site} uploadedImages={uploadedImages} />;
}
