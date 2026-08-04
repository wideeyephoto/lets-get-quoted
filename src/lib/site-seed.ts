// Turning a GeneratedSiteText into an updated Site.
//
// Extracted from WebsiteBuilder so there is exactly ONE definition of "what a
// generated site looks like when applied". Two callers now need it and they must
// not drift:
//
//   - the builder's "Generate" button, which applies it to local state and
//     leaves the owner to Save;
//   - seedSiteFromFirstRunAction, which applies it on the server and persists,
//     so a brand-new contractor lands on a finished site instead of an unsaved
//     one they could lose by closing the tab.
//
// Pure: no fetching, no Supabase, no React. Takes a Site and returns a new Site.

import {
  getSiteContent,
  mergeSiteContent,
  STOCK_SHOWCASE_TITLE,
  STOCK_SHOWCASE_INTRO,
  type NormalizedSiteContent,
} from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import { preferLocalSeoTitle } from '@/lib/seo/site-seo';
import type { StockImageResult, WebsiteImageAssignment } from '@/lib/stock/types';

/** Everything generateSiteTextAction produces. Mirrors its return type. */
export type GeneratedSiteText = {
  headline: string;
  tagline: string;
  seo_title: string;
  seo_description: string;
  hours: string;
  service_area: string;
  cities: string[];
  showcase_title: string;
  showcase_intro: string;
  services: { icon: string; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  testimonials: { author: string; text: string; rating: number; label: string }[];
  stats: { value: number; suffix: string; label: string }[];
  images: StockImageResult;
};

export function isStockUrl(stockImages: WebsiteImageAssignment[], url: string | null | undefined): boolean {
  return Boolean(url) && stockImages.some((item) => item.provider === 'pexels' && item.imageUrl === url);
}

// Apply auto-selected stock photos to the site, preserving the owner's uploads
// and any image they've already set (an existing image is only replaced if it's
// currently a stock photo or empty). Returns the changed hero + a content
// patch, or null when there's nothing to apply (Pexels was unavailable).
export function applyStockImages(
  current: Site,
  images: StockImageResult,
): { heroUrl: string | null; contentUpdates: Partial<NormalizedSiteContent> } | null {
  if (!images.ok) return null;
  const content = getSiteContent(current.content);
  const stock = content.stockImages;
  const replaceHero = !current.hero_url || isStockUrl(stock, current.hero_url);

  const filledSlots: Record<string, string> = {};
  for (const [slot, url] of Object.entries(images.slots)) {
    const currentUrl = content.images[slot];
    if (!currentUrl || isStockUrl(stock, currentUrl)) filledSlots[slot] = url;
  }

  const contentUpdates: Partial<NormalizedSiteContent> = {
    images: { ...content.images, ...filledSlots },
  };

  if (images.gallery.length > 0) {
    // Keep the owner's own photos — uploads AND any non-stock photo they picked
    // (e.g. Unsplash from the old library) — only refreshing previously
    // auto-applied stock tiles.
    const keptItems = content.showcase.items.filter((item) => item.source === 'upload' || !isStockUrl(stock, item.url));
    const wasEmpty = content.showcase.items.length === 0;
    contentUpdates.showcase = {
      ...content.showcase,
      enabled: true,
      // Only apply the honest "representative photos" label to a fresh gallery;
      // don't relabel a showcase the owner has already customized.
      title: wasEmpty ? STOCK_SHOWCASE_TITLE : content.showcase.title,
      intro: wasEmpty ? STOCK_SHOWCASE_INTRO : content.showcase.intro,
      items: [...keptItems, ...images.gallery],
    };

    // Also seed the Project showcase band with 4 of the same attributed stock
    // photos — but only when the owner hasn't added their own. They're the same
    // Pexels-credited, representative images as the gallery (source: 'stock'),
    // never claimed as the contractor's real completed jobs.
    const ownProject = content.projectShowcase.items.filter((item) => item.source === 'upload' || !isStockUrl(stock, item.url));
    if (ownProject.length === 0) {
      contentUpdates.projectShowcase = {
        ...content.projectShowcase,
        enabled: true,
        items: images.gallery.slice(0, 4).map((image) => ({ ...image })),
      };
    }
  }

  // Keep attribution accurate: only record assignments we actually applied, and
  // replace any prior record for the same role/id.
  const applied = images.assignments.filter((assignment) => {
    if (assignment.role === 'hero') return replaceHero;
    if (assignment.role === 'gallery') return images.gallery.length > 0;
    if (assignment.slot) return Boolean(filledSlots[assignment.slot]);
    return false;
  });
  const appliedIds = new Set(applied.map((assignment) => assignment.id));
  contentUpdates.stockImages = [...stock.filter((item) => !appliedIds.has(item.id)), ...applied];

  return {
    heroUrl: replaceHero ? (images.heroUrl || current.hero_url) : current.hero_url,
    contentUpdates,
  };
}

/**
 * Fold a generated site into an existing one.
 *
 * Every field falls back to what's already there, so a partial generation (the
 * model omitted something, Pexels was down) can only ever add. Nothing the owner
 * has written is overwritten by an empty string.
 */
export function applyGeneratedSiteText(current: Site, generated: GeneratedSiteText): Site {
  const content = getSiteContent(current.content);
  const contentUpdates: Partial<NormalizedSiteContent> = {};

  if (generated.services.length) {
    contentUpdates.services = { enabled: true, title: content.services.title || 'Our services', intro: '', items: generated.services.map((s, i) => ({ id: `svc-${i + 1}`, icon: s.icon, title: s.title, description: s.description })) };
  }
  if (generated.faqs.length) {
    contentUpdates.faqs = { enabled: true, title: content.faqs.title || 'Frequently asked questions', items: generated.faqs.map((f, i) => ({ id: `faq-${i + 1}`, question: f.question, answer: f.answer })) };
  }
  if (generated.cities.length) {
    contentUpdates.serviceAreas = { enabled: true, title: content.serviceAreas.title || 'Areas we serve', intro: content.serviceAreas.intro, cities: generated.cities };
  }
  // Testimonials seeded ON as editable examples — the owner is expected to
  // swap these for real reviews before (or soon after) publishing.
  if (generated.testimonials.length) {
    contentUpdates.testimonials = { ...content.testimonials, enabled: true, title: content.testimonials.title || 'What homeowners say', sourceMode: 'manual', items: generated.testimonials.map((t, i) => ({ id: `tst-${i + 1}`, author: t.author, text: t.text, rating: t.rating, label: t.label, imageUrl: '', imageAlt: '' })) };
  }
  if (generated.stats.length) {
    contentUpdates.stats = { enabled: true, title: content.stats.title || 'By the numbers', items: generated.stats.map((s, i) => ({ id: `stat-${i + 1}`, value: `${s.value.toLocaleString('en-US')}${s.suffix}`, label: s.label })) };
  }
  // Fold in auto-selected stock photos (hero, slots, gallery), preserving
  // any images the owner already set.
  const stock = applyStockImages(current, generated.images);
  if (stock) Object.assign(contentUpdates, stock.contentUpdates);
  // The photo gallery's heading + intro are generated too, so the section
  // speaks to this trade instead of the generic stock label. Applied after
  // the stock pass so it wins over applyStockImages' fallback wording.
  if (generated.showcase_title || generated.showcase_intro) {
    const base = contentUpdates.showcase ?? content.showcase;
    contentUpdates.showcase = {
      ...base,
      title: generated.showcase_title || base.title,
      intro: generated.showcase_intro || base.intro,
    };
  }

  const next: Site = {
    ...current,
    headline: generated.headline || current.headline,
    tagline: generated.tagline || current.tagline,
    seo_title: generated.seo_title || current.seo_title,
    seo_description: generated.seo_description || current.seo_description,
    hours: generated.hours || current.hours,
    service_area: generated.service_area || current.service_area,
    hero_url: stock ? stock.heroUrl : current.hero_url,
    content: mergeSiteContent(current.content, contentUpdates),
  };

  // The SEO title has to name the city and the trade — it is what a "<trade> in
  // <city>" search matches on, and the model is asked for that and does not
  // always deliver. Judged against `next`, not `current`, because the cities and
  // services it needs are the ones this generation just produced.
  //
  // Guarded on generated.seo_title so it can only ever judge machine-written
  // text: when the model returned nothing, the field falls through to whatever
  // the owner had, and nobody gets their own words second-guessed.
  return generated.seo_title
    ? { ...next, seo_title: preferLocalSeoTitle(next, generated.seo_title) }
    : next;
}

/**
 * Whether a site is still untouched enough to auto-generate over.
 *
 * The first-run seed must be able to run without asking, and must never clobber
 * work. The builder's own Generate button confirms first on exactly this
 * condition; here there is nobody to confirm with, so an unsure answer means
 * don't. Any headline, tagline, or SEO text the owner has written makes this
 * false, and so does a gallery they've already filled.
 */
export function siteIsUnwritten(site: Site): boolean {
  if (site.headline || site.tagline || site.seo_title || site.seo_description) return false;
  const content = getSiteContent(site.content);
  if (content.services.items.length > 0) return false;
  if (content.showcase.items.length > 0) return false;
  return true;
}
