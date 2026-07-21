import type { SiteImage } from '@/lib/site-images';

export type SiteSectionKey = 'showcase' | 'testimonials' | 'faqs';

export type SiteShowcaseItem = SiteImage & {
  caption?: string;
};

export type SiteShowcaseContent = {
  enabled: boolean;
  title: string;
  intro: string;
  layout: 'grid' | 'masonry' | 'featured';
  items: SiteShowcaseItem[];
};

export type SiteFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type SiteFaqContent = {
  enabled: boolean;
  title: string;
  items: SiteFaqItem[];
};

export type SiteTestimonialItem = {
  id: string;
  author: string;
  text: string;
  rating: number;
  label: string;
  imageUrl: string;
  imageAlt: string;
};

export type SiteTestimonialsContent = {
  enabled: boolean;
  title: string;
  sourceMode: 'manual' | 'google' | 'mixed';
  items: SiteTestimonialItem[];
};

export type SiteQuoteFormContent = {
  emailRequired: boolean;
  // Controls the wording used on the quote-request call-to-action ('Quick Estimate'
  // vs 'Instant Estimate') across the hero quick-capture form and the full form.
  estimateLabel: 'quick' | 'instant';
};

export function getEstimateButtonLabel(quoteForm: Pick<SiteQuoteFormContent, 'estimateLabel'>): string {
  return quoteForm.estimateLabel === 'instant' ? 'Instant Estimate' : 'Quick Estimate';
}

export type EstimateSizeBand = { min: number; max: number };
export type EstimateSize = 'small' | 'medium' | 'large';
export type EstimateMaterialTier = 'economical' | 'standard' | 'premium';

export type SiteEstimateRangesContent = {
  // Off by default — these are placeholder $ ranges until the contractor
  // reviews/edits them in the builder, so no site quotes a homeowner with
  // unreviewed numbers.
  enabled: boolean;
  small: EstimateSizeBand;
  medium: EstimateSizeBand;
  large: EstimateSizeBand;
  // Stored as multipliers (e.g. 0.85 = 15% below standard, 1.25 = 25% above).
  economicalMultiplier: number;
  premiumMultiplier: number;
};

export const DEFAULT_ESTIMATE_RANGES: SiteEstimateRangesContent = {
  enabled: false,
  small: { min: 2000, max: 6000 },
  medium: { min: 6000, max: 20000 },
  large: { min: 20000, max: 60000 },
  economicalMultiplier: 0.85,
  premiumMultiplier: 1.25,
};

export function computeEstimateRange(ranges: SiteEstimateRangesContent, size: EstimateSize, tier: EstimateMaterialTier): EstimateSizeBand {
  const band = ranges[size];
  const multiplier = tier === 'economical' ? ranges.economicalMultiplier : tier === 'premium' ? ranges.premiumMultiplier : 1;
  return {
    min: Math.max(0, Math.round((band.min * multiplier) / 50) * 50),
    max: Math.max(0, Math.round((band.max * multiplier) / 50) * 50),
  };
}

export type NormalizedSiteContent = {
  showcase: SiteShowcaseContent;
  faqs: SiteFaqContent;
  testimonials: SiteTestimonialsContent;
  quoteForm: SiteQuoteFormContent;
  estimateRanges: SiteEstimateRangesContent;
};

export const DEFAULT_SHOWCASE_TITLE = 'Project showcase';
export const DEFAULT_FAQ_TITLE = 'Frequently asked questions';
export const DEFAULT_TESTIMONIALS_TITLE = 'What homeowners say';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function toRating(value: unknown): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function parseEstimateBand(value: unknown, fallback: EstimateSizeBand): EstimateSizeBand {
  const record = isRecord(value) ? value : {};
  return {
    min: toPositiveNumber(record.min, fallback.min),
    max: toPositiveNumber(record.max, fallback.max),
  };
}

function parseShowcaseItems(value: unknown): SiteShowcaseItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is SiteShowcaseItem => {
    if (!isRecord(item)) return false;
    return (
      typeof item.id === 'string' &&
      typeof item.url === 'string' &&
      typeof item.alt === 'string' &&
      typeof item.category === 'string' &&
      (item.source === 'stock' || item.source === 'upload')
    );
  }).map((item) => ({
    id: item.id,
    url: item.url,
    alt: item.alt,
    category: item.category,
    source: item.source,
    storagePath: typeof item.storagePath === 'string' ? item.storagePath : undefined,
    caption: typeof item.caption === 'string' ? item.caption : undefined,
  }));
}

function parseFaqItems(value: unknown): SiteFaqItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `faq-${index + 1}`),
    question: toString(item.question),
    answer: toString(item.answer),
  }));
}

function parseTestimonials(value: unknown): SiteTestimonialItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `testimonial-${index + 1}`),
    author: toString(item.author),
    text: toString(item.text),
    rating: toRating(item.rating),
    label: toString(item.label),
    imageUrl: toString(item.imageUrl),
    imageAlt: toString(item.imageAlt),
  }));
}

export function getSiteContent(content: Record<string, unknown> | null | undefined): NormalizedSiteContent {
  const root = isRecord(content) ? content : {};
  const showcase = isRecord(root.showcase) ? root.showcase : {};
  const faqs = isRecord(root.faqs) ? root.faqs : {};
  const testimonials = isRecord(root.testimonials) ? root.testimonials : {};
  const quoteForm = isRecord(root.quoteForm) ? root.quoteForm : {};
  const estimateRanges = isRecord(root.estimateRanges) ? root.estimateRanges : {};

  return {
    showcase: {
      enabled: toBoolean(showcase.enabled),
      title: toString(showcase.title, DEFAULT_SHOWCASE_TITLE),
      intro: toString(showcase.intro, 'A look at recent work and finished details.'),
      layout: showcase.layout === 'masonry' || showcase.layout === 'featured' ? showcase.layout : 'grid',
      items: parseShowcaseItems(showcase.items),
    },
    faqs: {
      enabled: toBoolean(faqs.enabled),
      title: toString(faqs.title, DEFAULT_FAQ_TITLE),
      items: parseFaqItems(faqs.items),
    },
    testimonials: {
      enabled: toBoolean(testimonials.enabled),
      title: toString(testimonials.title, DEFAULT_TESTIMONIALS_TITLE),
      sourceMode: testimonials.sourceMode === 'google' || testimonials.sourceMode === 'mixed' ? testimonials.sourceMode : 'manual',
      items: parseTestimonials(testimonials.items),
    },
    quoteForm: {
      emailRequired: toBoolean(quoteForm.emailRequired),
      estimateLabel: quoteForm.estimateLabel === 'instant' ? 'instant' : 'quick',
    },
    estimateRanges: {
      enabled: toBoolean(estimateRanges.enabled),
      small: parseEstimateBand(estimateRanges.small, DEFAULT_ESTIMATE_RANGES.small),
      medium: parseEstimateBand(estimateRanges.medium, DEFAULT_ESTIMATE_RANGES.medium),
      large: parseEstimateBand(estimateRanges.large, DEFAULT_ESTIMATE_RANGES.large),
      economicalMultiplier: toPositiveNumber(estimateRanges.economicalMultiplier, DEFAULT_ESTIMATE_RANGES.economicalMultiplier),
      premiumMultiplier: toPositiveNumber(estimateRanges.premiumMultiplier, DEFAULT_ESTIMATE_RANGES.premiumMultiplier),
    },
  };
}

export function mergeSiteContent(content: Record<string, unknown>, updates: Partial<NormalizedSiteContent>): Record<string, unknown> {
  return {
    ...content,
    ...updates,
  };
}

export function getPublishedShowcase(content: Record<string, unknown> | null | undefined): SiteShowcaseContent | null {
  const showcase = getSiteContent(content).showcase;
  const items = showcase.items.filter((item) => item.url && item.alt);
  return showcase.enabled && items.length > 0 ? { ...showcase, items } : null;
}

export function getPublishedFaqs(content: Record<string, unknown> | null | undefined): SiteFaqContent | null {
  const faqs = getSiteContent(content).faqs;
  const items = faqs.items.filter((item) => item.question.trim() && item.answer.trim());
  return faqs.enabled && items.length > 0 ? { ...faqs, items } : null;
}

export function getPublishedTestimonials(content: Record<string, unknown> | null | undefined): SiteTestimonialsContent | null {
  const testimonials = getSiteContent(content).testimonials;
  const items = testimonials.items.filter((item) => item.text.trim());
  return testimonials.enabled && items.length > 0 ? { ...testimonials, items } : null;
}
