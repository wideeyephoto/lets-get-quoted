// Assigns fetched Pexels photos to the planned image roles. Pure and
// deterministic: given the same candidate pool, plan, and seed it always
// produces the same assignment, so a contractor's images stay stable across
// refreshes while different contractors (different seeds) get different picks.
// No photo is assigned to two visible roles.

import type { GeneratedImagePlan, PexelsPhoto, PlannedImage, StockImageRole, WebsiteImageAssignment } from './types';

// Maps a plan role to the content.images slot key it populates ('hero' and
// 'gallery' are handled specially in toAssignment). Kept local so this pure
// module has no runtime relative imports (keeps it directly node-testable).
const ROLE_TO_SLOT: Partial<Record<StockImageRole, string>> = {
  heroBackground: 'heroBackground',
  heroSecondary: 'heroSecondary',
  about: 'about',
  stats: 'stats',
};

// FNV-1a — small, stable, dependency-free.
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function aspect(photo: PexelsPhoto): number {
  return photo.height > 0 ? photo.width / photo.height : 1;
}

// Candidates acceptable for a planned image: not already used, orientation
// preference applied (relaxed if it would leave nothing). Wide roles (hero,
// backgrounds, stats) additionally favor the widest compositions so there's
// negative space for overlaid text.
function candidatesFor(pool: PexelsPhoto[], planned: PlannedImage, used: Set<number>): PexelsPhoto[] {
  const free = pool.filter((photo) => !used.has(photo.id));
  if (free.length === 0) return [];

  let pref = free;
  if (planned.orientation === 'landscape') {
    const landscape = free.filter((photo) => photo.orientation === 'landscape');
    if (landscape.length > 0) pref = landscape;
  } else if (planned.orientation === 'portrait') {
    const portrait = free.filter((photo) => photo.orientation === 'portrait');
    if (portrait.length > 0) pref = portrait;
  }

  const wideRole = planned.role === 'hero' || planned.role === 'heroBackground' || planned.role === 'stats';
  if (wideRole && pref.length > 1) {
    // Keep the widest half (most headline negative space), min 3, stable order.
    const sorted = [...pref].sort((a, b) => aspect(b) - aspect(a));
    pref = sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 2)));
  }
  return pref;
}

function toAssignment(planned: PlannedImage, photo: PexelsPhoto, selectedAt: string): WebsiteImageAssignment {
  const slot = planned.role === 'gallery' ? undefined : (ROLE_TO_SLOT[planned.role] || (planned.role === 'hero' ? 'hero' : undefined));
  return {
    id: `${planned.role}-${planned.index}`,
    role: planned.role,
    ...(slot ? { slot } : {}),
    ...(planned.serviceId ? { serviceId: planned.serviceId } : {}),
    provider: 'pexels',
    providerImageId: String(photo.id),
    sourceUrl: photo.sourceUrl,
    imageUrl: photo.imageUrl,
    thumbnailUrl: photo.thumbnailUrl,
    // Prefer the planned (role-aware, non-stuffed) alt; fall back to Pexels' alt.
    alt: planned.alt || photo.alt || '',
    photographerName: photo.photographerName,
    photographerUrl: photo.photographerUrl,
    searchQuery: planned.searchQuery,
    width: photo.width,
    height: photo.height,
    selectedAutomatically: true,
    selectedAt,
  };
}

/**
 * Assign photos from `pool` to `plan`'s roles. `seed` (a stable value such as
 * the site id) drives deterministic selection; `nowIso` stamps selectedAt (kept
 * as a parameter so the function stays pure/testable). Roles with no acceptable
 * candidate are skipped — the caller leaves those slots on their existing
 * fallback rather than showing a broken image.
 */
export function assignStockImages(
  pool: PexelsPhoto[],
  plan: GeneratedImagePlan,
  seed: string,
  nowIso = '',
): WebsiteImageAssignment[] {
  const used = new Set<number>();
  const assignments: WebsiteImageAssignment[] = [];
  const base = hashSeed(seed || plan.primaryTrade || 'lgq');

  for (const planned of plan.images) {
    const candidates = candidatesFor(pool, planned, used);
    if (candidates.length === 0) continue;
    const index = (base + hashSeed(`${planned.role}:${planned.index}`)) % candidates.length;
    const photo = candidates[index];
    used.add(photo.id);
    assignments.push(toAssignment(planned, photo, nowIso));
  }
  return assignments;
}
