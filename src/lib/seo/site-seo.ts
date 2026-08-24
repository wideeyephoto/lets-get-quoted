import type { Site } from '@/lib/sites';
import { getSiteContent, getHeroBadge } from '@/lib/site-content';
import {
  deriveLocation, generateSeoCopy, localTitleSignal, resolveSeoCopy, resolveSchemaType,
  type SeoContractorInput, type SeoCopy, type SeoFeature,
} from './seo-copy';
import { parseOpeningHours } from './opening-hours';

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

// The city and state read out of the free-text service area ALONE.
//
// Deliberately not deriveLocation(siteToSeoInput(site)): that input already
// carries `city` filled from the service-area LIST, and deriveLocation only
// parses the free text when city is blank. So it hands back the first outlying
// town and the contractor's actual home city is never recovered — measured on
// live data, "Lee's Summit and surrounding areas" resolved to "Blue Springs".
function homeLocation(site: Site): { city: string; region: string } {
  const { city, region } = deriveLocation({ serviceArea: trimmed(site.service_area) });
  return { city: usableCityName(city) ? city : '', region };
}

// Words no city name starts with. deriveLocation strips filler out of a free-text
// service area and title-cases what's left, which is fine for prose but will
// happily hand back "The Surrounding" from "the surrounding metro area".
//
// Prose can absorb that; a schema.org City node cannot. Naming a place is a
// factual claim about where this business operates, so anything that doesn't
// read like a place name is dropped rather than published. Applied ONLY to the
// derived city — the service-area list is entered as city names and is trusted.
const NOT_A_CITY_LEAD = /^(the|a|an|our|your|my|all|any|every|local|nearby|surrounding|entire|whole)\b/i;

function usableCityName(city: string): boolean {
  const value = trimmed(city);
  if (!value || !/[A-Za-z]/.test(value)) return false;
  return !NOT_A_CITY_LEAD.test(value);
}

// Every town this contractor claims, home city first. The free-text service area
// names the main one while the cities list holds the outlying towns and usually
// does NOT repeat it, so reading either alone loses a town.
function siteCities(site: Site): string[] {
  const content = getSiteContent(site.content);
  const all = [homeLocation(site).city, ...content.serviceAreas.cities].map(trimmed).filter(Boolean);
  return all.filter((city, index) => all.findIndex((other) => other.toLowerCase() === city.toLowerCase()) === index);
}

/**
 * The SEO title to actually save for a MACHINE-written site.
 *
 * The AI site generator is instructed to lead with the city and trade, and
 * doesn't always: it produced "Northgate Gutter Co | Licensed & Insured" for a
 * gutter installer in Lee's Summit, and on the live sites right now two of four
 * generated titles name no trade and one names no town at all. That field is
 * the single strongest thing a new contractor has for "<trade> in <city>", and
 * it was being decided by whatever the model felt like.
 *
 * So: keep the model's title when it already carries both signals, and
 * otherwise fall back to the deterministic generator — but only when that
 * genuinely scores higher. A weak generated title is never swapped for an
 * equally weak mechanical one just to have acted.
 *
 * This deliberately does NOT run on a title the owner typed. Preferring a saved
 * value is the contract resolveSeoCopy is built on, and a person's own words
 * about their own business outrank a heuristic. The only caller is the point
 * where generated text is applied.
 */
export function preferLocalSeoTitle(site: Site, generatedTitle: string): string {
  const candidate = trimmed(generatedTitle);
  if (!candidate) return candidate;

  const input = siteToSeoInput(site);
  const cities = siteCities(site);
  // Judge the trade against BOTH the primary service and the trade word, so a
  // title naming either one counts. Erring toward leaving the model's title
  // alone is the right bias when the alternative is overwriting written text.
  const service = `${input.primaryService ?? ''} ${input.trade ?? ''}`.trim();

  const candidateSignal = localTitleSignal(candidate, cities, service);
  if (candidateSignal.score === 2) return candidate;

  const generated = generateSeoCopy(input).title;
  const generatedSignal = localTitleSignal(generated, cities, service);
  return generatedSignal.score > candidateSignal.score ? generated : candidate;
}

// A published site is index-worthy once it carries meaningful, unique
// contractor content; otherwise we noindex it and drop it from the sitemap so
// thin/empty shells don't get indexed. Deliberately LENIENT: over-indexing a
// slightly thin page is a minor SEO inefficiency, but deindexing a real
// customer's page is severe, so any real signal (a hero photo, any copy, or any
// ENABLED content section that actually renders) qualifies. Only a bare shell —
// company name + address, no hero, no copy, every section off/empty — is
// excluded. Section checks mirror what the templates render (enabled + non-empty),
// covering every section, not just a subset.
export function isSiteSeoReady(site: Site): boolean {
  if (!site.published || !trimmed(site.company_name)) return false;

  const hasCopy = Boolean(trimmed(site.headline) || trimmed(site.tagline) || trimmed(site.seo_title) || trimmed(site.seo_description));
  const hasHero = Boolean(trimmed(site.hero_url));
  if (hasCopy || hasHero) return true;

  const c = getSiteContent(site.content);
  return (
    (c.services.enabled && c.services.items.some((item) => trimmed(item.title))) ||
    (c.faqs.enabled && c.faqs.items.some((item) => trimmed(item.question) && trimmed(item.answer))) ||
    (c.showcase.enabled && c.showcase.items.length > 0) ||
    (c.beforeAfter.enabled && c.beforeAfter.items.some((item) => trimmed(item.beforeUrl) && trimmed(item.afterUrl))) ||
    (c.testimonials.enabled && (c.testimonials.items.some((item) => trimmed(item.text)) || c.testimonials.googleReviews.length > 0)) ||
    (c.serviceAreas.enabled && c.serviceAreas.cities.some((city) => trimmed(city))) ||
    (c.stats.enabled && c.stats.items.some((item) => trimmed(item.label))) ||
    (c.certifications.enabled && c.certifications.items.some((item) => trimmed(item.label) || trimmed(item.imageUrl))) ||
    (c.blog.enabled && c.blog.posts.some((post) => post.status === 'published' && trimmed(post.title) && trimmed(post.body))) ||
    (c.howItWorks.enabled && c.howItWorks.steps.some((step) => trimmed(step.title)))
  );
}

// LocalBusiness JSON-LD using the most specific supported type. Consistent
// name/phone/area/url/logo with the visible page and other metadata. Carries no
// aggregateRating/review (Google disallows self-serving review markup). Returns
// null when there's no business name to describe.
//
// Every property here is built from data the contractor actually gave us. The
// ones still missing are missing because the data is, and they are listed
// rather than quietly skipped:
//
//   geo         no latitude/longitude is stored anywhere. The instant-booking
//               geocoder resolves a homeowner's address at request time; it
//               does not record the contractor's own coordinates, and inventing
//               them from a ZIP centroid would place the business at a point it
//               has no relationship to.
//   priceRange  nothing in the product asks what a business charges in the
//               "$$" sense, and deriving it from estimate ranges would be a
//               guess published as a fact.
//   streetAddress  never collected. Most of these contractors work out of a
//               truck, and the address field a homeowner would see is not one
//               they want indexed. `address` below carries locality/region/
//               postal code only, which is true and useful on its own.
//   aggregateRating / review  policy: Google disallows self-serving review
//               markup on a LocalBusiness.
export function buildLocalBusinessJsonLd(site: Site): Record<string, unknown> | null {
  const name = trimmed(site.company_name);
  if (!name) return null;

  const content = getSiteContent(site.content);
  const url = siteCanonicalUrl(site);
  const telephone = trimmed(site.phone);
  const image = trimmed(site.hero_url);
  const logo = trimmed(site.logo_url);
  const description = resolveSiteSeo(site).description;
  const type = resolveSchemaType(`${trimmed(content.trade)} ${trimmed(site.company_name)}`);

  // Structured towns beat the free-text blob: "Lee's Summit and surrounding
  // areas" is one opaque string to a parser, where a City list is twelve
  // matchable places. Falls back to the free text when there are no cities, so
  // this can only ever add. Capped because a service area is a claim, and a
  // hundred-city list reads as one nobody will honour.
  const cities = siteCities(site).slice(0, 30);
  const areaServed: unknown = cities.length > 0
    ? cities.map((entry) => ({ '@type': 'City', name: entry }))
    : trimmed(site.service_area) || null;

  // Locality + region + postal code, no street. `zip` is seeded from the ZIP
  // asked for at first run, so newer accounts carry a real one; older sites have
  // none and simply omit it.
  const region = homeLocation(site).region;
  const city = cities[0] ?? '';
  const postalCode = trimmed(content.zip);
  const address = city || postalCode
    ? {
        '@type': 'PostalAddress',
        ...(city ? { addressLocality: city } : {}),
        ...(region ? { addressRegion: region } : {}),
        ...(postalCode ? { postalCode } : {}),
        addressCountry: 'US',
      }
    : null;

  // Fails closed on anything it can't fully parse — see lib/seo/opening-hours.
  const openingHours = parseOpeningHours(site.hours);

  // `sameAs` is how Google connects this website to the same business's Google
  // Business Profile, Facebook page and review listings — the cheapest local-SEO
  // win available, and the reason the social links are worth validating as
  // strictly as lib/socials does.
  //
  // Read from the SAME accessor the footer renders from, so a profile can never
  // be claimed in the markup without also being linked on the page. A `sameAs`
  // pointing at a profile that isn't really this business is not a missed
  // opportunity, it's a false identity claim — which is exactly what a
  // wrong-box paste would produce if the URL weren't host-checked first.
  const sameAs = content.socials.map((s) => s.url);

  const serviceOffers = content.services.enabled
    ? content.services.items
        .map((item) => trimmed(item.title))
        .filter(Boolean)
        .slice(0, 15)
        .map((title) => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: title,
          },
        }))
    : [];

  const hasOfferCatalog = serviceOffers.length > 0
    ? {
        '@type': 'OfferCatalog',
        name: `${name} Services`,
        itemListElement: serviceOffers,
      }
    : null;

  return {
    '@context': 'https://schema.org',
    '@type': type,
    name,
    ...(url ? { url } : {}),
    ...(telephone ? { telephone } : {}),
    ...(image ? { image } : {}),
    ...(logo ? { logo } : {}),
    ...(address ? { address } : {}),
    ...(areaServed ? { areaServed } : {}),
    ...(openingHours.length > 0 ? { openingHoursSpecification: openingHours } : {}),
    ...(hasOfferCatalog ? { hasOfferCatalog } : {}),
    ...(description ? { description } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}
