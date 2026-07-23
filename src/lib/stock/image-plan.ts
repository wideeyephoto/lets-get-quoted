// Builds a per-role Pexels search plan from the contractor's trade and the
// services their generated site lists. Pure and dependency-free so it's
// unit-testable. Each role gets its OWN query (hero != about != each service
// card) so the site isn't wallpapered with one generic photo.

import type { GeneratedImagePlan, PlannedImage, StockImageRole } from './types';

const GALLERY_COUNT = 4;

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function titleCase(text: string): string {
  return clean(text).replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// Reduce a trade/service string to plain search words: lowercase, strip
// punctuation, drop filler that hurts stock-photo relevance.
const FILLER = /\b(services?|service|solutions?|professional|expert|quality|our|the|and|&|company|co|llc|inc)\b/gi;
function toQueryWords(text: string): string {
  return clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a natural, non-stuffed alt sentence for a role.
function altFor(role: StockImageRole, trade: string, serviceLabel?: string): string {
  const t = trade || 'home services';
  switch (role) {
    case 'hero':
      return `A residential home where ${t} is provided`;
    case 'heroSecondary':
      return `Close-up detail of ${t} work`;
    case 'about':
      return `A professional performing ${t}`;
    case 'gallery':
      return serviceLabel ? `${titleCase(serviceLabel)} on a home` : `Finished ${t} at a home`;
    // heroBackground and stats sit behind text — decorative, empty alt.
    default:
      return '';
  }
}

export function buildImagePlan(trade: string | null | undefined, serviceTitles: Array<string | null | undefined> = []): GeneratedImagePlan {
  const tradeWords = toQueryWords(trade || '') || 'home services';
  const primaryTrade = titleCase(trade || '') || 'Home Services';

  const images: PlannedImage[] = [
    { role: 'hero', index: 0, searchQuery: `${tradeWords} residential home exterior`, preferredSubject: 'wide-scene', orientation: 'landscape', alt: altFor('hero', tradeWords) },
    { role: 'heroBackground', index: 0, searchQuery: `${tradeWords} house exterior wide`, preferredSubject: 'wide-scene', orientation: 'landscape', alt: '' },
    { role: 'heroSecondary', index: 0, searchQuery: `${tradeWords} detail close up`, preferredSubject: 'detail', orientation: 'portrait', alt: altFor('heroSecondary', tradeWords) },
    { role: 'about', index: 0, searchQuery: `${tradeWords} worker at work`, preferredSubject: 'worker', orientation: 'landscape', alt: altFor('about', tradeWords) },
    { role: 'stats', index: 0, searchQuery: `${tradeWords} finished residential result`, preferredSubject: 'completed-work', orientation: 'landscape', alt: '' },
  ];

  // Gallery: one query PER real service, so the three cards for a window
  // cleaner (exterior / interior / screens) don't share one photo. Pad with
  // trade completed-work variants when there aren't enough services.
  const services = serviceTitles.map((title) => clean(title)).filter(Boolean).slice(0, GALLERY_COUNT);
  const seen = new Set<string>();
  for (let i = 0; i < GALLERY_COUNT; i += 1) {
    const serviceLabel = services[i];
    const serviceWords = serviceLabel ? toQueryWords(serviceLabel) : '';
    // When a service is too niche/empty, fall back to the trade's completed work.
    const baseQuery = serviceWords && serviceWords.length > 2 ? `${serviceWords} residential` : `${tradeWords} completed work home`;
    let query = baseQuery;
    let suffix = 1;
    while (seen.has(query)) {
      query = `${baseQuery} ${['clean', 'detail', 'finished', 'exterior'][suffix % 4]}`;
      suffix += 1;
    }
    seen.add(query);
    images.push({
      role: 'gallery',
      index: i,
      searchQuery: query,
      preferredSubject: i % 2 === 0 ? 'completed-work' : 'detail',
      orientation: 'landscape',
      alt: altFor('gallery', tradeWords, serviceLabel),
      // The visible tile overlay advertises the service; alt stays descriptive.
      caption: serviceLabel ? titleCase(serviceLabel) : `Expert ${primaryTrade}`,
    });
  }

  return { primaryTrade, images };
}

// The distinct search queries in a plan — what the Pexels fetcher runs (deduped
// so we don't hit the API once per near-identical query).
export function planQueries(plan: GeneratedImagePlan): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const image of plan.images) {
    const key = image.searchQuery.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(image.searchQuery);
    }
  }
  return out;
}
