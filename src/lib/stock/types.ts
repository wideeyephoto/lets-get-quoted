// Shared types for the Pexels stock-image pipeline (plan -> fetch -> assign).
import type { SiteImage } from '@/lib/site-images';

export type ImageOrientation = 'landscape' | 'portrait' | 'square';

export type PreferredSubject = 'completed-work' | 'wide-scene' | 'detail' | 'worker' | 'tools';

// The image roles that actually exist as slots in the templates:
//  hero            -> site.hero_url (every template)
//  heroBackground  -> content.images.heroBackground (Shine full-bleed hero bg)
//  heroSecondary   -> content.images.heroSecondary (Coat / Guild / Shine inset)
//  about           -> content.images.about (Care/handy about circle)
//  stats           -> content.images.stats (animated stats band, every template)
//  gallery         -> content.showcase.items[] (project/service gallery)
// (Services render as ICONS, not photos, so there is no service-card image role;
//  no template has a dedicated CTA background image either.)
export type StockImageRole = 'hero' | 'heroBackground' | 'heroSecondary' | 'about' | 'stats' | 'gallery';

export type PlannedImage = {
  role: StockImageRole;
  // Distinguishes multiple images for the same role (gallery 0..n).
  index: number;
  searchQuery: string;
  preferredSubject: PreferredSubject;
  orientation: ImageOrientation;
  // Natural, non-keyword-stuffed alt text. '' marks a decorative background.
  alt: string;
  serviceId?: string;
};

export type GeneratedImagePlan = {
  primaryTrade: string;
  images: PlannedImage[];
};

// A normalized Pexels photo (subset of the API response we use).
export type PexelsPhoto = {
  id: number;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  orientation: ImageOrientation;
  alt: string;
  photographerName: string;
  photographerUrl: string;
  sourceUrl: string;
};

// A saved image assignment with full provenance/attribution. Stored in
// content.stockImages; the render fields (hero_url, content.images.<slot>,
// showcase.items) are kept in sync for backward compatibility.
export type WebsiteImageAssignment = {
  id: string;
  role: string;
  slot?: string;
  serviceId?: string;
  provider: 'pexels' | 'upload';
  providerImageId?: string;
  sourceUrl?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  alt: string;
  photographerName?: string;
  photographerUrl?: string;
  searchQuery?: string;
  width?: number;
  height?: number;
  selectedAutomatically: boolean;
  selectedAt: string;
};

// A Pexels photo shaped for the "Replace photo" picker gallery (client-safe).
export type PexelsPickPhoto = {
  id: string; // `pexels-<n>` (used as a SiteImage id / React key)
  providerImageId: string; // `<n>`
  url: string;
  thumbnailUrl: string;
  alt: string;
  photographerName: string;
  photographerUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
};

export type PexelsSearchResult = {
  configured: boolean;
  photos: PexelsPickPhoto[];
};

// Render-ready output of the stock-image pipeline. `ok: false` (empty
// selections) means Pexels was unavailable, so the caller keeps existing
// placeholders. Safe to reference from client code (no server-only imports).
export type StockImageResult = {
  ok: boolean;
  configured: boolean;
  heroUrl?: string;
  slots: Record<string, string>;
  gallery: SiteImage[];
  assignments: WebsiteImageAssignment[];
};
