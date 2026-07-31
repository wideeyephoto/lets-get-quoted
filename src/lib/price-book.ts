import { getTradeGlyph } from '@/lib/site-content';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';

// Display helpers for the price book. Kept out of the page so the icon matching
// and the money formatting are unit-testable — both have edge cases that are easy
// to get subtly wrong and hard to notice by eye.

export const UNIT_SUFFIX: Record<string, string> = {
  each: '',
  hour: '/hr',
  sqft: '/sq ft',
  visit: '/visit',
  job: '/job',
};

// The app-wide formatMoney() rounds to whole dollars, which is right for a $3,750
// invoice and wrong for a price book: sod at $1.20/sqft rendered as "$1", a 17%
// error on every square foot quoted. Keep cents whenever the price actually has
// them, and never show ".00" when it doesn't.
export function formatUnitPrice(price: number): string {
  const value = Number(price) || 0;
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return (
    '$' +
    value.toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    })
  );
}

export function unitSuffix(unit: string | null | undefined): string {
  if (!unit) return '';
  return UNIT_SUFFIX[unit] ?? `/${unit}`;
}

// Line items a contractor actually types into a price book, which the site-builder's
// trade rules don't cover — those match a *trade* ("landscaping"), not a service
// ("Core aeration"). Most specific wins.
const SERVICE_GLYPH_RULES: { test: RegExp; glyph: string }[] = [
  // Landscaping
  { test: /\bmow|string-?trim|\bcut\b/, glyph: 'scissors' },
  { test: /mulch|topsoil|compost|\bsoil/, glyph: 'shovel' },
  { test: /irrigation|sprinkler|backflow/, glyph: 'droplet' },
  { test: /aerat|overseed|seeding|fertiliz|weed\s*control|lime\b/, glyph: 'sprout' },
  { test: /\bbeds?\b|planting|shrub|hedge|prun|edging/, glyph: 'shrub' },
  { test: /snow|plow|salt|de-?ic/, glyph: 'snowflake' },
  // Exterior
  { test: /gutter/, glyph: 'droplets' },
  { test: /siding|soffit|fascia/, glyph: 'layers' },
  { test: /shingle|flashing|ridge\s*vent/, glyph: 'home' },
  { test: /patio|walkway|driveway|retaining\s*wall|paver|hardscape/, glyph: 'brickwall' },
  { test: /\bseal|resurfac|striping/, glyph: 'roller' },
  // Electrical — the trade rule alone gives a whole book the same lightning bolt.
  { test: /outlet|receptacle|\bswitch/, glyph: 'plug' },
  { test: /breaker|\bpanel\b|service\s*upgrade|sub-?panel/, glyph: 'power' },
  { test: /light(ing|bulb)?\b|recessed|can\s*light|sconce|chandelier/, glyph: 'lightbulb' },
  // Mechanical
  { test: /\bduct/, glyph: 'airvent' },
  { test: /water\s*heater|tankless/, glyph: 'flame' },
  { test: /thermostat/, glyph: 'thermometer' },
  { test: /\bfan\b/, glyph: 'fan' },
  // Cleaning
  { test: /window\s*(clean|wash)|glass\s*clean|pane/, glyph: 'spray' },
  { test: /carpet|upholster|\brug\b/, glyph: 'brush' },
  // Line items every trade has
  { test: /inspect|assess|audit|estimate|consult|\bdesign/, glyph: 'ruler' },
  { test: /trip\s*charge|service\s*call|diagnostic|call-?\s*out|dispatch/, glyph: 'truck' },
  { test: /emergency|after-?\s*hours|same-?\s*day|\brush\b/, glyph: 'bolt' },
  { test: /haul|debris|junk\s*removal|disposal|dump/, glyph: 'trash' },
  { test: /filter|tune-?\s*up|maintenance\s*plan|service\s*plan|annual/, glyph: 'settings' },
];

// Last resort, and only when the whole book has nothing better — otherwise a
// generic verb shadows the trade: "Faucet install" and "Outlet install" are not
// the same job, and giving both a hammer says nothing about either.
const GENERIC_GLYPH_RULES: { test: RegExp; glyph: string }[] = [
  { test: /install|replace|\bnew\b|upgrade/, glyph: 'hammer' },
  { test: /repair|\bfix\b|service/, glyph: 'wrench' },
  { test: /clean|wash/, glyph: 'sparkles' },
];

function firstMatch(rules: { test: RegExp; glyph: string }[], text: string): string | null {
  for (const rule of rules) {
    if (rule.test.test(text) && SERVICE_ICON_GLYPHS[rule.glyph]) return rule.glyph;
  }
  return null;
}

// getTradeGlyph() answers 'home' for anything it doesn't recognize, which would put
// the same house icon on half a price book. Return null instead so the caller can
// substitute something better.
function matchGlyph(name: string): string | null {
  const text = (name || '').toLowerCase();
  if (!text.trim()) return null;
  const specific = firstMatch(SERVICE_GLYPH_RULES, text);
  if (specific) return specific;
  const trade = getTradeGlyph(text);
  // 'home' is getTradeGlyph's own unrecognized-trade fallback, so seeing it here
  // means nothing matched — unless the name really is roof/siding work.
  if (trade === 'home' && !/roof|siding/.test(text)) return null;
  return trade;
}

// Icons for a whole price book at once. Anything unmatched inherits the book's own
// most common icon, so a landscaper's "Core aeration" reads as landscaping rather
// than falling back to a generic mark that matches none of its neighbours.
export function glyphsForServices(names: string[]): string[] {
  const matched = names.map(matchGlyph);
  const tally = new Map<string, number>();
  for (const glyph of matched) {
    if (glyph) tally.set(glyph, (tally.get(glyph) ?? 0) + 1);
  }
  let fallback = '';
  let best = 0;
  for (const [glyph, count] of tally) {
    if (count > best) {
      best = count;
      fallback = glyph;
    }
  }
  return matched.map((glyph, index) => {
    if (glyph) return glyph;
    if (fallback) return fallback;
    // Nothing in the whole book matched — a book of "Standard package" and
    // "Add-on". Now the generic verbs are the best signal available.
    return firstMatch(GENERIC_GLYPH_RULES, (names[index] || '').toLowerCase()) ?? 'spark';
  });
}

export type PriceBookStats = { count: number; average: number; lowest: number; highest: number };

// Only priced services count: a $0 placeholder would drag the average down and
// report a "$0 – $350" range that makes the book look unfinished.
export function priceBookStats(prices: number[]): PriceBookStats | null {
  const priced = prices.map((p) => Number(p) || 0).filter((p) => p > 0);
  if (priced.length === 0) return null;
  return {
    count: priced.length,
    average: priced.reduce((sum, p) => sum + p, 0) / priced.length,
    lowest: Math.min(...priced),
    highest: Math.max(...priced),
  };
}
