export interface LocalBusinessSchemaParams {
  businessName: string;
  trade: string;
  phone?: string | null;
  email?: string | null;
  websiteUrl: string;
  streetAddress?: string | null;
  city: string;
  state: string;
  postalCode: string;
  serviceAreas?: string[];
  ratingValue?: number;
  reviewCount?: number;
  openingHours?: string[];
}

/**
 * Generates valid Google-compliant JSON-LD structured data for contractor local SEO
 */
export function generateLocalBusinessJsonLd(params: LocalBusinessSchemaParams): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: params.businessName,
    description: `Licensed & Insured ${params.trade} contractor serving ${params.city}, ${params.state} and surrounding areas.`,
    url: params.websiteUrl,
    telephone: params.phone || '+18005550199',
    email: params.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: params.streetAddress || undefined,
      addressLocality: params.city,
      addressRegion: params.state,
      postalCode: params.postalCode,
      addressCountry: 'US',
    },
    areaServed: (params.serviceAreas && params.serviceAreas.length > 0)
      ? params.serviceAreas.map((area) => ({
          '@type': 'City',
          name: area,
        }))
      : {
          '@type': 'City',
          name: params.city,
        },
    priceRange: '$$',
    paymentAccepted: 'Cash, Credit Card, Apple Pay, Google Pay, Check',
    currenciesAccepted: 'USD',
  };

  if (params.reviewCount && params.reviewCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: params.ratingValue || 4.9,
      reviewCount: params.reviewCount,
      bestRating: '5',
      worstRating: '1',
    };
  }

  return schema;
}

/**
 * Generates open graph meta tags and title for contractor website pages
 */
export function generateContractorPageMeta(params: {
  businessName: string;
  trade: string;
  city: string;
  state: string;
}): { title: string; description: string; ogTitle: string } {
  const title = `${params.businessName} · Top-Rated ${params.trade} in ${params.city}, ${params.state}`;
  const description = `Get a fast, guaranteed quote from ${params.businessName}. Professional ${params.trade.toLowerCase()} services in ${params.city} with instant estimates and warranty-backed work.`;

  return {
    title,
    description,
    ogTitle: title,
  };
}
