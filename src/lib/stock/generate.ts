import 'server-only';
import type { SiteImage } from '@/lib/site-images';
import { buildImagePlan, planQueries } from './image-plan';
import { assignStockImages } from './assign';
import { fetchStockPool, isPexelsConfigured } from './pexels';
import type { StockImageResult } from './types';

export type { StockImageResult } from './types';

// Fetch a trade-relevant candidate pool from Pexels and deterministically assign
// photos to every real template image role, returning render-ready fields plus
// the attribution records. Never throws: on any failure it returns ok:false with
// empty selections so website generation completes regardless.
export async function generateStockImages(opts: {
  seed: string;
  trade: string;
  serviceTitles: string[];
  nowIso?: string;
}): Promise<StockImageResult> {
  const configured = isPexelsConfigured();
  const empty: StockImageResult = { ok: false, configured, slots: {}, gallery: [], assignments: [] };
  if (!configured) return empty;

  const plan = buildImagePlan(opts.trade, opts.serviceTitles);
  const pool = await fetchStockPool(planQueries(plan));
  if (pool.length === 0) return empty;

  const assignments = assignStockImages(pool, plan, opts.seed, opts.nowIso || new Date().toISOString());
  if (assignments.length === 0) return empty;

  const slots: Record<string, string> = {};
  const gallery: SiteImage[] = [];
  let heroUrl: string | undefined;

  for (const assignment of assignments) {
    if (assignment.role === 'hero') {
      heroUrl = assignment.imageUrl;
    } else if (assignment.role === 'gallery') {
      gallery.push({
        id: `pexels-${assignment.providerImageId}`,
        url: assignment.imageUrl,
        alt: assignment.alt || 'Representative service photo',
        ...(assignment.caption ? { caption: assignment.caption } : {}),
        category: 'craft',
        source: 'stock',
      });
    } else if (assignment.slot) {
      slots[assignment.slot] = assignment.imageUrl;
    }
  }

  return { ok: true, configured, heroUrl, slots, gallery, assignments };
}
