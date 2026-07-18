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

export type NormalizedSiteContent = {
  showcase: SiteShowcaseContent;
  faqs: SiteFaqContent;
  testimonials: SiteTestimonialsContent;
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
