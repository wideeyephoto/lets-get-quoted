import { requireOwnerContext } from '@/lib/auth';
import { listUploadedSiteImages } from '@/lib/site-image-storage';
import { getOrCreateSite } from '@/lib/sites';
import WebsiteBuilder from './WebsiteBuilder';

export const metadata = {
  title: 'Website Settings',
  description: 'Customize your contractor website',
};

// `?built=1` is set by first run when it generated the whole site from the
// business name, trade and ZIP. Without a word of explanation the owner arrives
// at a finished website they never asked anyone to write, which reads as
// somebody else's site rather than a head start on their own.
//
// Intake tuning used to be rendered here and passed into the builder as a slot.
// It lives on Settings → Automations → Intake AI now: none of it changed how
// the site looked, and a page about headlines and photos was the wrong place to
// decide which leads interrupt somebody.
//
// `?open=<key>` opens one card straight away, for links sent from elsewhere in
// the dashboard — Automations → Review requests points at `reviews`, because
// the Google Business Profile the review ask needs is set on that card and
// nowhere else.
export default async function SitesPage({ searchParams }: { searchParams?: { built?: string; open?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const justBuilt = searchParams?.built === '1';

  // Get or create site
  const site = await getOrCreateSite(supabase, accountId);
  const uploadedImages = await listUploadedSiteImages(accountId);

  return (
    <WebsiteBuilder
      site={site}
      uploadedImages={uploadedImages}
      justBuilt={justBuilt}
      openTarget={searchParams?.open ?? null}
    />
  );
}
