import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getAllPublishedVideos } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import { cspNonce } from '@/lib/csp-nonce';
import { buildVideoListJsonLd } from '@/lib/seo/video-seo';
import { siteCanonicalUrl } from '@/lib/seo/site-seo';
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

  // The reason this page is a real URL instead of an anchor into the homepage
  // is that it can be indexed — and without VideoObject markup Google can see a
  // page with videos on it but can't produce a video result FOR it, which is
  // the whole point. An ItemList because the page genuinely is a list.
  const videoJsonLd = buildVideoListJsonLd(entries, {
    siteUrl: siteCanonicalUrl(site) ?? '',
    siteUpdatedAt: site.updated_at ?? null,
    businessName: site.company_name || 'Our team',
  });

  return (
    <>
      {videoJsonLd && (
        <script
          type="application/ld+json"
          nonce={cspNonce()}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <SiteVideoIndex
        site={site}
        title={title}
        intro={`See the work before you call. ${entries.length} clip${entries.length === 1 ? '' : 's'} from real jobs.`}
        entries={entries}
      />
    </>
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
