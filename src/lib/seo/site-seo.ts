import type { Site } from '@/lib/sites';
import { getSiteContent, getHeroBadge } from '@/lib/site-content';
import { resolveSeoCopy, resolveSchemaType, type SeoContractorInput, type SeoCopy, type SeoFeature } from './seo-copy';

// Adapts a Site (+ its normalized content) to the pure SEO generator, and
// derives the values the public routes and structured data render. Keeps the
// route/component layer thin so the tested pure module in ./seo-copy.ts is the
// single source of truth for the actual copy.

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

// The public URL Google should treat as canonical for this site.
export function siteCanonicalUrl(site: Site): string | undefined {
  if (site.custom_domain_verified_at && site.custom_domain) return `https://${site.custom_domain}`;
  if (site.subdomain) return `https://${site.subdomain}.${ROOT_DOMAIN}`;
  return undefined;
}

// Trust phrases that read as unsupported claims — kept out of the title's
// differentiator slot even if the owner picked that hero badge.
const CLAIMY = /\b(best|#?1|top[\s-]?rated|number one|no\.?\s*1|5[\s-]?star)\b/i;

// The Let's Get Quoted customer-experience features every published site can
// honestly reference; the instant AI estimate is added only when it's enabled.
function siteFeatures(content: ReturnType<typeof getSiteContent>): SeoFeature[] {
  const features: SeoFeature[] = ['instantQuotes', 'onlineScheduling', 'textUpdates', 'paymentRequests', 'jobDashboard', 'statusAnytime'];
  if (content.estimateRanges.enabled) features.push('instantEstimate');
  return features;
}

export function siteToSeoInput(site: Site): SeoContractorInput {
  const content = getSiteContent(site.content);
  const primaryService =
    content.services.items.map((item) => trimmed(item.title)).find(Boolean) || trimmed(content.trade);
  const city = content.serviceAreas.cities.map((entry) => trimmed(entry)).find(Boolean) || '';
  const badge = getHeroBadge(site.content);
  const badgeLabel = badge ? trimmed(badge.title) : '';
  const differentiator = badgeLabel && !CLAIMY.test(badgeLabel) && badgeLabel.length <= 24 ? badgeLabel : '';

  return {
    seed: site.id,
    businessName: trimmed(site.company_name),
    primaryService,
    trade: trimmed(content.trade),
    city,
    serviceArea: trimmed(site.service_area),
    differentiator,
    features: siteFeatures(content),
  };
}

// Resolved title + description for the public page. Saved (manually edited)
// values win; anything blank is filled by the generator so metadata is always
// present and unique. Independent per field, so a saved title + blank
// description still gets a generated description.
export function resolveSiteSeo(site: Site): SeoCopy {
  return resolveSeoCopy({ title: site.seo_title, description: site.seo_description }, siteToSeoInput(site));
}

// A published site is index-worthy only once it carries meaningful, unique
// contractor content — otherwise we noindex it and drop it from the sitemap so
// thin/empty pages don't get indexed.
export function isSiteSeoReady(site: Site): boolean {
  if (!site.published || !trimmed(site.company_name)) return false;
  const content = getSiteContent(site.content);
  const hasCopy = Boolean(trimmed(site.headline) || trimmed(site.tagline) || trimmed(site.seo_description));
  const hasSection =
    content.services.items.some((item) => trimmed(item.title)) ||
    content.faqs.items.some((item) => trimmed(item.question)) ||
    content.showcase.items.length > 0;
  return hasCopy || hasSection;
}

// LocalBusiness JSON-LD using the most specific supported type. Consistent
// name/phone/area/url/logo with the visible page and other metadata. Carries no
// aggregateRating/review (Google disallows self-serving review markup). Returns
// null when there's no business name to describe.
//
// Unavailable-by-design fields (documented, intentionally omitted rather than
// faked): postal `address` (no address field is collected), structured
// `openingHoursSpecification` (hours are stored as free text like
// "Mon-Fri 8am-6pm", which is not valid for the structured property), and
// `aggregateRating`/`review` (policy).
export function buildLocalBusinessJsonLd(site: Site): Record<string, unknown> | null {
  const name = trimmed(site.company_name);
  if (!name) return null;

  const content = getSiteContent(site.content);
  const url = siteCanonicalUrl(site);
  const telephone = trimmed(site.phone);
  const image = trimmed(site.hero_url);
  const logo = trimmed(site.logo_url);
  const areaServed = trimmed(site.service_area);
  const description = resolveSiteSeo(site).description;
  const type = resolveSchemaType(`${trimmed(content.trade)} ${trimmed(site.company_name)}`);

  return {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    ...(url ? { url } : {}),
    ...(telephone ? { telephone } : {}),
    ...(image ? { image } : {}),
    ...(logo ? { logo } : {}),
    ...(areaServed ? { areaServed } : {}),
    ...(description ? { description } : {}),
  };
}
