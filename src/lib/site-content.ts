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

export type SiteStickyCallBarContent = {
  enabled: boolean;
  showQuote: boolean;
};

export type SiteRatingBadgeContent = {
  // Off by default. When on, renders an on-page aggregate-rating badge AND
  // emits LocalBusiness + aggregateRating/Review JSON-LD for rich results.
  enabled: boolean;
  rating: number;
  reviewCount: number;
  sourceLabel: string;
};

export type SiteTrustBadgeItem = {
  id: string;
  label: string;
  enabled: boolean;
};

export type SiteTrustBadgesContent = {
  enabled: boolean;
  badges: SiteTrustBadgeItem[];
};

export type SiteFinancingContent = {
  enabled: boolean;
  monthlyFrom: number;
  blurb: string;
  applyUrl: string;
};

export type SiteServiceAreasContent = {
  enabled: boolean;
  title: string;
  intro: string;
  cities: string[];
};

export type SiteCertificationItem = {
  id: string;
  label: string;
  imageUrl: string;
  imageAlt: string;
};

export type SiteCertificationsContent = {
  enabled: boolean;
  title: string;
  items: SiteCertificationItem[];
};

export type SiteStatItem = {
  id: string;
  value: number;
  prefix: string;
  suffix: string;
  label: string;
};

export type SiteStatsContent = {
  enabled: boolean;
  title: string;
  items: SiteStatItem[];
};

export type SiteBeforeAfterItem = {
  id: string;
  beforeUrl: string;
  beforeAlt: string;
  afterUrl: string;
  afterAlt: string;
  label: string;
};

export type SiteBeforeAfterContent = {
  enabled: boolean;
  title: string;
  intro: string;
  items: SiteBeforeAfterItem[];
};

// A thin availability/urgency band mounted above the site header (not in the
// mid-page content stack). Contractor-typed so it never fabricates urgency.
export type SiteAnnouncementContent = {
  enabled: boolean;
  message: string;
  subtext: string;
};

// Icon service-card grid — the centerpiece of the home-services aesthetic.
// `icon` is a key into ServiceIcon's set (falls back to a generic mark).
export type SiteServiceItem = {
  id: string;
  icon: string;
  title: string;
  description: string;
};

export type SiteServicesContent = {
  enabled: boolean;
  title: string;
  intro: string;
  items: SiteServiceItem[];
};

// Numbered "how it works" steps — the process a homeowner goes through
// (book → we arrive → job done). Step numbers are derived from order.
export type SiteProcessStep = {
  id: string;
  title: string;
  description: string;
};

export type SiteHowItWorksContent = {
  enabled: boolean;
  title: string;
  intro: string;
  steps: SiteProcessStep[];
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

// Shown ranges lean toward the cheaper side on purpose — this is a rough,
// pre-visit estimate, and a scary high top-end number is what actually turns
// a lead away before the contractor ever gets a chance to quote the real
// price in person. We keep the low end (the floor the contractor set) as-is
// since that's what makes the range feel credible, and pull the top end down
// by this fraction of the original spread instead.
const ESTIMATE_HIGH_END_LEAN_FACTOR = 0.7;

export function computeEstimateRange(ranges: SiteEstimateRangesContent, size: EstimateSize, tier: EstimateMaterialTier): EstimateSizeBand {
  const band = ranges[size];
  const multiplier = tier === 'economical' ? ranges.economicalMultiplier : tier === 'premium' ? ranges.premiumMultiplier : 1;
  const min = band.min * multiplier;
  const max = band.max * multiplier;
  const leanedMax = min + (max - min) * ESTIMATE_HIGH_END_LEAN_FACTOR;
  return {
    min: Math.max(0, Math.round(min / 50) * 50),
    max: Math.max(0, Math.round(leanedMax / 50) * 50),
  };
}

export type NormalizedSiteContent = {
  showcase: SiteShowcaseContent;
  faqs: SiteFaqContent;
  testimonials: SiteTestimonialsContent;
  quoteForm: SiteQuoteFormContent;
  estimateRanges: SiteEstimateRangesContent;
  stickyCallBar: SiteStickyCallBarContent;
  ratingBadge: SiteRatingBadgeContent;
  trustBadges: SiteTrustBadgesContent;
  financing: SiteFinancingContent;
  serviceAreas: SiteServiceAreasContent;
  certifications: SiteCertificationsContent;
  stats: SiteStatsContent;
  beforeAfter: SiteBeforeAfterContent;
  announcement: SiteAnnouncementContent;
  services: SiteServicesContent;
  howItWorks: SiteHowItWorksContent;
};

export const DEFAULT_SHOWCASE_TITLE = 'Project showcase';
export const DEFAULT_FAQ_TITLE = 'Frequently asked questions';
export const DEFAULT_TESTIMONIALS_TITLE = 'What homeowners say';
export const DEFAULT_RATING_SOURCE_LABEL = 'Verified reviews';
export const DEFAULT_FINANCING_BLURB = 'Flexible financing available on approved credit.';
export const DEFAULT_SERVICE_AREAS_TITLE = 'Areas we serve';
export const DEFAULT_SERVICE_AREAS_INTRO = 'Proudly serving homeowners across the region.';
export const DEFAULT_CERTIFICATIONS_TITLE = 'Certifications & awards';
export const DEFAULT_STATS_TITLE = 'By the numbers';
export const DEFAULT_BEFORE_AFTER_TITLE = 'Before & after';
export const DEFAULT_SERVICES_TITLE = 'What we do';
export const DEFAULT_HOW_IT_WORKS_TITLE = 'How it works';
export const DEFAULT_BEFORE_AFTER_INTRO = 'Drag to see the transformation.';

export const DEFAULT_TRUST_BADGES: SiteTrustBadgeItem[] = [
  { id: 'licensed', label: 'Licensed', enabled: true },
  { id: 'insured', label: 'Insured', enabled: true },
  { id: 'bonded', label: 'Bonded', enabled: true },
  { id: 'free-estimates', label: 'Free estimates', enabled: true },
  { id: 'guaranteed', label: 'Satisfaction guaranteed', enabled: true },
];

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

// Like toRating but keeps one decimal place (e.g. 4.9) for the aggregate badge.
function toRatingValue(value: unknown, fallback = 5): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(rating)) return fallback;
  return Math.min(5, Math.max(1, Math.round(rating * 10) / 10));
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

function parseTrustBadges(value: unknown): SiteTrustBadgeItem[] {
  if (!Array.isArray(value)) return DEFAULT_TRUST_BADGES.map((badge) => ({ ...badge }));

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `badge-${index + 1}`),
    label: toString(item.label),
    enabled: item.enabled !== false,
  }));
}

function parseCities(value: unknown): string[] {
  // Keep empty strings so a just-added blank input survives re-render while
  // editing (getPublishedServiceAreas filters empties for the public site).
  if (!Array.isArray(value)) return [];
  return value.map((item) => toString(item)).slice(0, 80);
}

function parseCertifications(value: unknown): SiteCertificationItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `cert-${index + 1}`),
    label: toString(item.label),
    imageUrl: toString(item.imageUrl),
    imageAlt: toString(item.imageAlt),
  }));
}

function parseStats(value: unknown): SiteStatItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `stat-${index + 1}`),
    value: toPositiveNumber(item.value, 0),
    prefix: toString(item.prefix),
    suffix: toString(item.suffix),
    label: toString(item.label),
  }));
}

function parseBeforeAfter(value: unknown): SiteBeforeAfterItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item, index) => ({
    id: toString(item.id, `ba-${index + 1}`),
    beforeUrl: toString(item.beforeUrl),
    beforeAlt: toString(item.beforeAlt),
    afterUrl: toString(item.afterUrl),
    afterAlt: toString(item.afterAlt),
    label: toString(item.label),
  }));
}

function parseServices(value: unknown): SiteServiceItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, 8).map((item, index) => ({
    id: toString(item.id, `svc-${index + 1}`),
    icon: toString(item.icon, 'spark'),
    title: toString(item.title),
    description: toString(item.description),
  }));
}

function parseProcessSteps(value: unknown): SiteProcessStep[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).slice(0, 5).map((item, index) => ({
    id: toString(item.id, `step-${index + 1}`),
    title: toString(item.title),
    description: toString(item.description),
  }));
}

export function getSiteContent(content: Record<string, unknown> | null | undefined): NormalizedSiteContent {
  const root = isRecord(content) ? content : {};
  const showcase = isRecord(root.showcase) ? root.showcase : {};
  const faqs = isRecord(root.faqs) ? root.faqs : {};
  const testimonials = isRecord(root.testimonials) ? root.testimonials : {};
  const quoteForm = isRecord(root.quoteForm) ? root.quoteForm : {};
  const estimateRanges = isRecord(root.estimateRanges) ? root.estimateRanges : {};
  const stickyCallBar = isRecord(root.stickyCallBar) ? root.stickyCallBar : {};
  const ratingBadge = isRecord(root.ratingBadge) ? root.ratingBadge : {};
  const trustBadges = isRecord(root.trustBadges) ? root.trustBadges : {};
  const financing = isRecord(root.financing) ? root.financing : {};
  const serviceAreas = isRecord(root.serviceAreas) ? root.serviceAreas : {};
  const certifications = isRecord(root.certifications) ? root.certifications : {};
  const stats = isRecord(root.stats) ? root.stats : {};
  const beforeAfter = isRecord(root.beforeAfter) ? root.beforeAfter : {};
  const announcement = isRecord(root.announcement) ? root.announcement : {};
  const services = isRecord(root.services) ? root.services : {};
  const howItWorks = isRecord(root.howItWorks) ? root.howItWorks : {};

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
    stickyCallBar: {
      enabled: stickyCallBar.enabled !== false,
      showQuote: stickyCallBar.showQuote !== false,
    },
    ratingBadge: {
      enabled: toBoolean(ratingBadge.enabled),
      rating: toRatingValue(ratingBadge.rating),
      reviewCount: Math.max(0, Math.round(toPositiveNumber(ratingBadge.reviewCount, 0))),
      sourceLabel: toString(ratingBadge.sourceLabel, DEFAULT_RATING_SOURCE_LABEL),
    },
    estimateRanges: {
      enabled: toBoolean(estimateRanges.enabled),
      small: parseEstimateBand(estimateRanges.small, DEFAULT_ESTIMATE_RANGES.small),
      medium: parseEstimateBand(estimateRanges.medium, DEFAULT_ESTIMATE_RANGES.medium),
      large: parseEstimateBand(estimateRanges.large, DEFAULT_ESTIMATE_RANGES.large),
      economicalMultiplier: toPositiveNumber(estimateRanges.economicalMultiplier, DEFAULT_ESTIMATE_RANGES.economicalMultiplier),
      premiumMultiplier: toPositiveNumber(estimateRanges.premiumMultiplier, DEFAULT_ESTIMATE_RANGES.premiumMultiplier),
    },
    trustBadges: {
      enabled: toBoolean(trustBadges.enabled),
      badges: parseTrustBadges(trustBadges.badges),
    },
    financing: {
      enabled: toBoolean(financing.enabled),
      monthlyFrom: Math.max(0, Math.round(toPositiveNumber(financing.monthlyFrom, 0))),
      blurb: toString(financing.blurb, DEFAULT_FINANCING_BLURB),
      applyUrl: toString(financing.applyUrl),
    },
    serviceAreas: {
      enabled: toBoolean(serviceAreas.enabled),
      title: toString(serviceAreas.title, DEFAULT_SERVICE_AREAS_TITLE),
      intro: toString(serviceAreas.intro, DEFAULT_SERVICE_AREAS_INTRO),
      cities: parseCities(serviceAreas.cities),
    },
    certifications: {
      enabled: toBoolean(certifications.enabled),
      title: toString(certifications.title, DEFAULT_CERTIFICATIONS_TITLE),
      items: parseCertifications(certifications.items),
    },
    stats: {
      enabled: toBoolean(stats.enabled),
      title: toString(stats.title, DEFAULT_STATS_TITLE),
      items: parseStats(stats.items),
    },
    beforeAfter: {
      enabled: toBoolean(beforeAfter.enabled),
      title: toString(beforeAfter.title, DEFAULT_BEFORE_AFTER_TITLE),
      intro: toString(beforeAfter.intro, DEFAULT_BEFORE_AFTER_INTRO),
      items: parseBeforeAfter(beforeAfter.items),
    },
    announcement: {
      enabled: toBoolean(announcement.enabled),
      message: toString(announcement.message).slice(0, 140),
      subtext: toString(announcement.subtext).slice(0, 140),
    },
    services: {
      enabled: toBoolean(services.enabled),
      title: toString(services.title, DEFAULT_SERVICES_TITLE),
      intro: toString(services.intro),
      items: parseServices(services.items),
    },
    howItWorks: {
      enabled: toBoolean(howItWorks.enabled),
      title: toString(howItWorks.title, DEFAULT_HOW_IT_WORKS_TITLE),
      intro: toString(howItWorks.intro),
      steps: parseProcessSteps(howItWorks.steps),
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

export function getPublishedStickyCallBar(
  content: Record<string, unknown> | null | undefined,
  phone: string | null | undefined,
): SiteStickyCallBarContent | null {
  const stickyCallBar = getSiteContent(content).stickyCallBar;
  return stickyCallBar.enabled && Boolean(phone && phone.trim()) ? stickyCallBar : null;
}

export function getPublishedRatingBadge(content: Record<string, unknown> | null | undefined): SiteRatingBadgeContent | null {
  const ratingBadge = getSiteContent(content).ratingBadge;
  return ratingBadge.enabled && ratingBadge.reviewCount > 0 ? ratingBadge : null;
}

export function getPublishedTrustBadges(content: Record<string, unknown> | null | undefined): SiteTrustBadgesContent | null {
  const trustBadges = getSiteContent(content).trustBadges;
  const badges = trustBadges.badges.filter((badge) => badge.enabled && badge.label.trim());
  return trustBadges.enabled && badges.length > 0 ? { ...trustBadges, badges } : null;
}

export function getPublishedFinancing(content: Record<string, unknown> | null | undefined): SiteFinancingContent | null {
  const financing = getSiteContent(content).financing;
  return financing.enabled && financing.monthlyFrom > 0 ? financing : null;
}

export function getPublishedServiceAreas(content: Record<string, unknown> | null | undefined): SiteServiceAreasContent | null {
  const serviceAreas = getSiteContent(content).serviceAreas;
  const cities = serviceAreas.cities.map((city) => city.trim()).filter(Boolean);
  return serviceAreas.enabled && cities.length > 0 ? { ...serviceAreas, cities } : null;
}

export function getPublishedCertifications(content: Record<string, unknown> | null | undefined): SiteCertificationsContent | null {
  const certifications = getSiteContent(content).certifications;
  const items = certifications.items.filter((item) => item.label.trim() || item.imageUrl.trim());
  return certifications.enabled && items.length > 0 ? { ...certifications, items } : null;
}

export function getPublishedStats(content: Record<string, unknown> | null | undefined): SiteStatsContent | null {
  const stats = getSiteContent(content).stats;
  const items = stats.items.filter((item) => item.label.trim());
  return stats.enabled && items.length > 0 ? { ...stats, items } : null;
}

export function getPublishedBeforeAfter(content: Record<string, unknown> | null | undefined): SiteBeforeAfterContent | null {
  const beforeAfter = getSiteContent(content).beforeAfter;
  const items = beforeAfter.items.filter((item) => item.beforeUrl.trim() && item.afterUrl.trim());
  return beforeAfter.enabled && items.length > 0 ? { ...beforeAfter, items } : null;
}

export function getPublishedAnnouncement(content: Record<string, unknown> | null | undefined): SiteAnnouncementContent | null {
  const announcement = getSiteContent(content).announcement;
  return announcement.enabled && announcement.message.trim() ? announcement : null;
}

export function getPublishedServices(content: Record<string, unknown> | null | undefined): SiteServicesContent | null {
  const services = getSiteContent(content).services;
  const items = services.items.filter((item) => item.title.trim());
  return services.enabled && items.length > 0 ? { ...services, items } : null;
}

export function getPublishedHowItWorks(content: Record<string, unknown> | null | undefined): SiteHowItWorksContent | null {
  const howItWorks = getSiteContent(content).howItWorks;
  const steps = howItWorks.steps.filter((step) => step.title.trim());
  return howItWorks.enabled && steps.length > 0 ? { ...howItWorks, steps } : null;
}
