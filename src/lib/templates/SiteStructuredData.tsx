import type { Site } from '@/lib/sites';
import { cspNonce } from '@/lib/csp-nonce';
import { getPublishedVideoSections } from '@/lib/site-content';
import { buildLocalBusinessJsonLd, siteCanonicalUrl } from '@/lib/seo/site-seo';
import { buildVideoGraphJsonLd } from '@/lib/seo/video-seo';

// Serialize JSON-LD safely for an inline <script>: escape the one sequence that
// could break out of the element if it appears in contractor-entered text.
function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Emits LocalBusiness identity structured data (name, phone, area served,
// image, logo, canonical URL, description) for a published contractor site,
// using the most specific schema.org subtype the trade supports. Deliberately
// carries NO aggregateRating/review — Google disallows self-serving review
// markup on a LocalBusiness, so that stays out until reviews come from a
// verified third-party source. The node is built by the shared, tested
// buildLocalBusinessJsonLd so it stays consistent with the page's <title>/meta.
// Rendered once from the public routes, so it covers every template.
export default function SiteStructuredData({ site }: { site: Site }) {
  const data = buildLocalBusinessJsonLd(site);

  // Videos embedded on this page get their own nodes. Only the clips a band
  // actually RENDERS — getPublishedVideoSections trims each band to what its
  // style shows, and describing a video that isn't on the page is the kind of
  // mismatch Google penalises. The full set lives on /videos, which has its own
  // ItemList.
  //
  // A separate <script> rather than folded into the LocalBusiness node: these
  // are individual videos that share a page, not a gallery the page is about,
  // and neither should pretend to contain the other.
  const nonce = cspNonce();
  const videos = buildVideoGraphJsonLd(
    getPublishedVideoSections(site.content).flatMap((section) => section.videos.map((item) => ({ item, section }))),
    {
      siteUrl: siteCanonicalUrl(site) ?? '',
      siteUpdatedAt: site.updated_at ?? null,
      businessName: site.company_name || 'Our team',
    },
  );

  if (!data && !videos) return null;

  // nonce: script-src covers ld+json too, and Next only stamps its own scripts.
  // Without this, enforcing the CSP would drop these tags from every contractor
  // site — invisibly, since nothing on the page changes. See lib/csp-nonce.
  return (
    <>
      {data && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdSafe(data) }} />}
      {videos && <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLdSafe(videos) }} />}
    </>
  );
}
