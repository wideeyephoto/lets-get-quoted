import type { Site } from '@/lib/sites';

// Serialize JSON-LD safely for an inline <script>: escape the one sequence that
// could break out of the element if it appears in contractor-entered text.
function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Emits LocalBusiness *identity* structured data (name, phone, area served,
// image, canonical URL) for a published contractor site. Deliberately carries
// NO aggregateRating/review — Google disallows self-serving review markup on a
// LocalBusiness, so that stays out until reviews come from a verified
// third-party source. This identity node is compliant and is the top local-SEO
// lever: it feeds the knowledge panel / local pack. Rendered once from the
// public routes, so it covers every template.
export default function SiteStructuredData({ site }: { site: Site }) {
  const name = site.company_name.trim();
  if (!name) return null;

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const url = site.custom_domain_verified_at && site.custom_domain
    ? `https://${site.custom_domain}`
    : site.subdomain
      ? `https://${site.subdomain}.${rootDomain}`
      : undefined;

  // Trim every field before deciding to include it, so a whitespace-only value
  // never emits a present-but-empty property. (license is intentionally NOT
  // mapped to hasCredential: that property's range is EducationalOccupational-
  // Credential, not a free-text string, and Google doesn't consume it for a
  // LocalBusiness anyway.)
  const telephone = site.phone?.trim();
  const image = site.hero_url?.trim();
  const areaServed = site.service_area?.trim();
  const description = (site.seo_description || site.tagline || '').trim();

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name,
    ...(url ? { url } : {}),
    ...(telephone ? { telephone } : {}),
    ...(image ? { image } : {}),
    ...(areaServed ? { areaServed } : {}),
    ...(description ? { description } : {}),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(data) }} />;
}
