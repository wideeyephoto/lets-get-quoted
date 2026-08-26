import { TRADES, getTrade, type Trade } from './trades';
import { tradeCategoryProblems } from './trade-categories';

/**
 * Non-exclusive curated collections of trades for merchandising and discovery.
 *
 * Distinct from TRADE_CATEGORIES (which defines structural, mutually-exclusive
 * one-trade-to-one-category directory taxonomy). A trade may appear in a curated
 * collection like SEASONAL_TRADE_SLUGS while retaining its single category filing.
 */

export const SEASONAL_TRADE_SLUGS = [
  'holiday-lighting',
  'lawn-care',
  'mosquito-tick-control',
  'snow-removal',
  'pool-services',
  'irrigation',
  'chimney-sweep',
  'gutters',
  'pressure-washing',
] as const;

export type SeasonalTradeSlug = (typeof SEASONAL_TRADE_SLUGS)[number];

const BY_SLUG = new Map(TRADES.map((trade) => [trade.slug, trade] as const));

/** Returns all seasonal trade records in collection order. */
export function seasonalTrades(): Trade[] {
  return SEASONAL_TRADE_SLUGS.map((slug) => BY_SLUG.get(slug)).filter(
    (trade): trade is Trade => Boolean(trade),
  );
}

/**
 * Validates that seasonal trade collections are sound.
 * Returns an array of problem strings if any invariants fail.
 */
export function tradeCollectionProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const slug of SEASONAL_TRADE_SLUGS) {
    if (seen.has(slug)) {
      problems.push(`SEASONAL_TRADE_SLUGS contains duplicate "${slug}"`);
    }
    seen.add(slug);

    const trade = getTrade(slug);
    if (!trade) {
      problems.push(`SEASONAL_TRADE_SLUGS names "${slug}", which is not a defined trade`);
    }
  }

  // Ensure collection has both new seasonal trades and established legacy ones
  const hasHoliday = SEASONAL_TRADE_SLUGS.includes('holiday-lighting');
  const hasSnow = SEASONAL_TRADE_SLUGS.includes('snow-removal');
  if (!hasHoliday || !hasSnow) {
    problems.push('SEASONAL_TRADE_SLUGS must contain both newly added and legacy seasonal trades');
  }

  // Ensure category taxonomy is unaffected
  const categoryIssues = tradeCategoryProblems();
  if (categoryIssues.length > 0) {
    problems.push(...categoryIssues);
  }

  return problems;
}
