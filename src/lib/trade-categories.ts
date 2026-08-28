import { TRADES, type Trade } from './trades';

/**
 * The full slate of trades, grouped so a directory can be scanned instead of read.
 *
 * WHY A SEPARATE MODULE. The grouping is an editorial judgement, not a fact
 * about the data, and it has one failure mode that is silent in the browser: a
 * trade that belongs to no group, or to two, simply goes missing from the
 * filtered view or appears twice. `assertEveryTradeIsFiledOnce` below is what a
 * test calls; keeping the mapping out of the page keeps that possible.
 *
 * The groups are named for what the contractor DOES, not for a construction
 * taxonomy — "Outdoor & grounds", not "Site work" — because the person reading
 * the page is looking for their own job title.
 */

export type TradeCategory = {
  id: string;
  label: string;
  /** Slugs, in the order they appear in TRADES. */
  slugs: string[];
};

export const TRADE_CATEGORIES: TradeCategory[] = [
  {
    id: 'outdoor',
    label: 'Outdoor & grounds',
    slugs: [
      'landscapers',
      'tree-services',
      'irrigation',
      'snow-removal',
      'pressure-washing',
      'fencing',
      'deck-builders',
      'paving',
      'excavation',
      'pool-services',
      'concrete',
      'lawn-care',
      'pond-services',
      'hardscaping',
      'artificial-turf',
      'landscape-lighting',
      'land-clearing',
      'pool-builders',
      'sports-courts',
      'shed-builders',
      'sealcoating',
      'concrete-leveling',
      'paver-sealing',
      'pole-barns',
      'farm-fencing',
      'stump-grinding',
      'dog-fencing',
    ],
  },
  {
    id: 'envelope',
    label: 'Roof, siding & structure',
    slugs: [
      'roofers',
      'siding',
      'gutters',
      'window-installers',
      'insulation',
      'masonry',
      'stucco',
      'foundation-repair',
      'chimney-sweep',
      'screen-enclosures',
      'basement-waterproofing',
      'glass-and-mirrors',
      'ironwork-and-railings',
      'radon-mitigation',
      'awnings',
      'commercial-roofing',
      'demolition',
      'crawlspace-encapsulation',
    ],
  },
  {
    id: 'systems',
    label: 'Plumbing, electrical & systems',
    slugs: [
      'plumbers',
      'electricians',
      'hvac',
      'solar',
      'generators',
      'septic',
      'well-water',
      'garage-doors',
      'locksmiths',
      'air-duct-cleaning',
      'smart-home-av',
      'fire-protection',
      'ev-chargers',
      'trenchless-sewer',
      'mini-split-installers',
      'gas-fitters',
      'geothermal-hvac',
      'drain-cleaning',
      'outdoor-audio',
      'gate-automation',
      'generator-maintenance',
      'water-filtration',
    ],
  },
  {
    id: 'interiors',
    label: 'Interiors & remodeling',
    slugs: [
      'painters',
      'remodelers',
      'flooring',
      'drywall',
      'tile',
      'countertops',
      'cabinetry',
      'epoxy-flooring',
      'window-treatments',
      'cabinet-refinishing',
      'custom-closets',
      'finish-carpentry',
      'wallpaper-installers',
      'bathroom-remodelers',
      'garage-remodeling',
      'cabinet-refacing',
      'venetian-plaster',
      'staircase-remodeling',
      'hardwood-refinishing',
      'grout-restoration',
      'wine-cellars',
      'saunas',
    ],
  },
  {
    id: 'cleaning',
    label: 'Cleaning & restoration',
    slugs: [
      'cleaning-services',
      'window-cleaning',
      'carpet-cleaning',
      'water-damage-restoration',
      'junk-removal',
      'pest-control',
      'auto-detailing',
      'mosquito-tick-control',
      'bin-cleaning',
      'solar-panel-cleaning',
      'mold-remediation',
      'commercial-cleaning',
      'post-construction-cleaning',
      'fleet-washing',
      'hood-cleaning',
      'pet-waste-removal',
      'parking-lot-striping',
      'wildlife-removal',
      'dry-ice-blasting',
    ],
  },
  {
    id: 'repair',
    label: 'Repair & home services',
    slugs: [
      'handyman',
      'appliance-repair',
      'home-inspectors',
      'movers',
      'holiday-lighting',
      'mobile-mechanics',
      'paintless-dent-repair',
      'window-tinting',
      'marine-services',
      'mobile-tires',
      'auto-glass',
      'mobile-pet-grooming',
      'small-engine-repair',
      'rv-repair',
      'golf-cart-service',
      'mobile-knife-sharpening',
      'event-rentals',
    ],
  },
];

/**
 * The shortlist shown before anyone types anything.
 *
 * EDITORIAL, NOT MEASURED. We have no traffic data on which of the trades people
 * arrive looking for, so this is not labelled "popular" or "most searched" on
 * the page — it is the head of the TRADES array, which is itself ordered by
 * hand, and the page calls it what it is: a place to start.
 */
export const COMMON_TRADE_SLUGS = [
  'landscapers',
  'roofers',
  'plumbers',
  'electricians',
  'hvac',
  'painters',
  'cleaning-services',
  'remodelers',
];

const BY_SLUG = new Map(TRADES.map((trade) => [trade.slug, trade] as const));

export function tradesBySlugs(slugs: readonly string[]): Trade[] {
  return slugs.map((slug) => BY_SLUG.get(slug)).filter((trade): trade is Trade => !!trade);
}

/** Every trade, A–Z by display name. */
export function tradesAlphabetical(): Trade[] {
  return [...TRADES].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** The category a trade is filed under, or null if the mapping has a hole. */
export function categoryOf(slug: string): TradeCategory | null {
  return TRADE_CATEGORIES.find((category) => category.slugs.includes(slug)) ?? null;
}

/**
 * Every trade appears in exactly one category, and every category names only
 * trades that exist. Returns the problems rather than throwing, so a test can
 * print all of them at once instead of one per run.
 */
export function tradeCategoryProblems(): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string[]>();

  for (const category of TRADE_CATEGORIES) {
    for (const slug of category.slugs) {
      if (!BY_SLUG.has(slug)) problems.push(`${category.id} names "${slug}", which is not a trade`);
      seen.set(slug, [...(seen.get(slug) ?? []), category.id]);
    }
  }
  for (const trade of TRADES) {
    const filed = seen.get(trade.slug) ?? [];
    if (filed.length === 0) problems.push(`"${trade.slug}" is in no category`);
    if (filed.length > 1) problems.push(`"${trade.slug}" is in ${filed.join(' and ')}`);
  }
  for (const slug of COMMON_TRADE_SLUGS) {
    if (!BY_SLUG.has(slug)) problems.push(`COMMON_TRADE_SLUGS names "${slug}", which is not a trade`);
  }
  return problems;
}

/**
 * Everything a search should match, lower-cased and joined.
 *
 * The name alone is not enough: somebody typing "gutters" should find Gutter
 * Companies, and somebody typing "water heater" should find Plumbers — which
 * only works if the services each trade lists are searched too.
 */
export function searchIndexFor(trade: Trade): string {
  return [trade.name, trade.work, ...trade.services].join(' ').toLowerCase();
}
