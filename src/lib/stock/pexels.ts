import 'server-only';
import type { ImageOrientation, PexelsPhoto } from './types';

// Server-side Pexels client. The API key lives in PEXELS_API_KEY (env only —
// never shipped to the browser). Results are cached in-process for ~24h so we
// don't re-hit the API for the same query, and a candidate pool is built by
// running several role queries and de-duplicating by photo id.

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // ~24 hours
const POOL_CAP = 40;

type CacheEntry = { at: number; photos: PexelsPhoto[] };
const cache = new Map<string, CacheEntry>();

function orientationOf(width: number, height: number): ImageOrientation {
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.87) return 'portrait';
  return 'square';
}

type RawPexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt: string | null;
  photographer: string;
  photographer_url: string;
  src: { large2x?: string; large?: string; landscape?: string; original?: string; medium?: string; tiny?: string };
};

function normalize(raw: RawPexelsPhoto): PexelsPhoto | null {
  const imageUrl = raw.src?.large2x || raw.src?.large || raw.src?.landscape || raw.src?.original || raw.src?.medium;
  if (!imageUrl || typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    imageUrl,
    thumbnailUrl: raw.src?.tiny || raw.src?.medium || imageUrl,
    width: raw.width || 0,
    height: raw.height || 0,
    orientation: orientationOf(raw.width, raw.height),
    alt: (raw.alt || '').trim(),
    photographerName: (raw.photographer || '').trim(),
    photographerUrl: (raw.photographer_url || '').trim(),
    sourceUrl: raw.url || '',
  };
}

export function isPexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

// One search, cached ~24h. Returns [] on any failure (never throws) so callers
// can degrade gracefully.
async function searchPexels(query: string, orientation?: ImageOrientation, perPage = 15): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query.trim()) return [];

  const key = `${query.toLowerCase()}|${orientation || 'any'}|${perPage}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.photos;

  const params = new URLSearchParams({ query, per_page: String(perPage) });
  if (orientation) params.set('orientation', orientation);

  try {
    const response = await fetch(`${PEXELS_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      // Let Next cache at the fetch layer too; our Map is the primary cache.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { photos?: RawPexelsPhoto[] };
    const photos = (data.photos || []).map(normalize).filter((photo): photo is PexelsPhoto => photo !== null);
    cache.set(key, { at: Date.now(), photos });
    return photos;
  } catch {
    return [];
  }
}

/**
 * Build a de-duplicated candidate pool (~30-40 photos) from several role
 * queries. Runs the queries in parallel, dedupes by Pexels photo id, and caps
 * the pool. Returns [] if Pexels is unavailable — the caller then keeps the
 * template's existing placeholders.
 */
export async function fetchStockPool(queries: string[], orientation?: ImageOrientation): Promise<PexelsPhoto[]> {
  if (!isPexelsConfigured() || queries.length === 0) return [];
  // Cap generously — the image plan emits ~9 distinct queries; never drop a
  // planned (service-specific) query. perQuery is sized off what we actually run.
  const capped = queries.slice(0, 12);
  const perQuery = Math.max(6, Math.ceil(POOL_CAP / capped.length) + 3);
  const results = await Promise.all(capped.map((query) => searchPexels(query, orientation, perQuery)));

  const byId = new Map<number, PexelsPhoto>();
  for (const photos of results) {
    for (const photo of photos) {
      if (!byId.has(photo.id)) byId.set(photo.id, photo);
    }
  }
  return Array.from(byId.values()).slice(0, POOL_CAP);
}
