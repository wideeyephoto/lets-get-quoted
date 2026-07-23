import { requireOwnerContext } from '@/lib/auth';
import { getSiteGallery } from '@/lib/site-images';
import { getOrCreateSite, withPublicContact } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';

export const dynamic = 'force-dynamic';

export default async function SitePreviewPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const site = await getOrCreateSite(supabase, accountId);
  const Template = getTemplate(site.template);

  if (!Template) {
    return <main style={{ padding: '2rem' }}>The selected theme is unavailable.</main>;
  }

  return <Template site={withPublicContact(site)} galleryImages={getSiteGallery(site.content)} />;
}