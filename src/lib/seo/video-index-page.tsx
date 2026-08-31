import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Site } from '@/lib/sites';
import { getAllPublishedVideos } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import { cspNonce } from '@/lib/csp-nonce';
import { buildVideoListJsonLd } from '@/lib/seo/video-seo';
import { siteCanonicalUrl } from '@/lib/seo/site-seo';
import SiteVideoIndex from '@/lib/templates/SiteVideoIndex';

// The standalone /videos index, shared by both tenant route trees.
//
// Every clip on the site, gathered from all of its video bands. The bands stay
// on the homepage as marketing; this is the portfolio — a real URL that can be
// shared and indexed, which an anchor into the middle of a page cannot be.
//
// Shared rather than duplicated because the structured data below is the entire
// point of the page, and two copies of it would be two chances to drift.

export async function renderSiteVideoIndex(site: Site | null) {
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
          nonce={await cspNonce()}
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

export function siteVideoIndexMetadata(site: Site | null): Metadata {
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
