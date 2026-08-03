import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getAllPublishedVideos } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteVideoIndex from '@/lib/templates/SiteVideoIndex';

export const dynamic = 'force-dynamic';

type Props = { params: { subdomain: string } };

// Every clip on the site, gathered from all of its video bands. The bands stay
// on the homepage as marketing; this is the portfolio — a real URL that can be
// shared and indexed, which an anchor into the middle of a page cannot be.
export default async function PublicVideoIndexPage({ params }: Props) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) notFound();
  const entries = getAllPublishedVideos(site.content);
  if (entries.length === 0) notFound();

  const title = `${site.company_name || 'Our'} videos`;
  return (
    <SiteVideoIndex
      site={site}
      title={title}
      intro={`See the work before you call. ${entries.length} clip${entries.length === 1 ? '' : 's'} from real jobs.`}
      entries={entries}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) return { title: 'Not found' };
  const entries = getAllPublishedVideos(site.content);
  if (entries.length === 0) return { title: 'Not found' };
  const title = `Videos | ${site.company_name}`;
  return {
    title: { absolute: title },
    description: `Watch ${site.company_name} at work — ${entries.length} clip${entries.length === 1 ? '' : 's'} from real jobs.`,
    icons: siteIconsMetadata(site),
  };
}
