import { TRADES } from './trades';

/**
 * Guessing what trade somebody is typing.
 *
 * The vocabulary is the one that already exists: every `/for/<trade>` landing
 * page's `work` noun. Using the same words in Settings means the phrase that
 * drives somebody's website is a phrase the rest of the product already knows,
 * rather than a free-text string that happens to rhyme with one.
 *
 * It is a SUGGESTION, never a constraint. Trades are stranger and more specific
 * than any list — "low-voltage lighting", "horse fencing", "koi ponds" — and a
 * picker that refuses those is worse than no picker. Anything typed is kept.
 */

/**
 * What people actually type versus what the list calls it.
 *
 * Almost all of these are the JOB TITLE rather than the trade: somebody types
 * what they call themselves ("electrician", "plumber", "roofer") and the list
 * is written the other way round. Without this the field looks broken for the
 * most common trades in the product.
 */
const ALIASES: Record<string, string> = {
  electrician: 'electrical work',
  electric: 'electrical work',
  plumber: 'plumbing',
  roofer: 'roofing',
  painter: 'painting',
  landscaper: 'landscaping',
  gardening: 'landscaping',
  hardscaping: 'landscaping',
  lawn: 'lawn care',
  mowing: 'lawn care',
  'lawn care': 'lawn care',
  'lawn service': 'lawn care',
  fertilization: 'lawn care',
  'christmas lights': 'holiday lighting',
  'holiday lights': 'holiday lighting',
  'holiday lighting': 'holiday lighting',
  'seasonal lighting': 'holiday lighting',
  mosquito: 'mosquito & tick control',
  'tick control': 'mosquito & tick control',
  'tick spraying': 'mosquito & tick control',
  'barrier treatment': 'mosquito & tick control',
  'barrier spray': 'mosquito & tick control',
  'duct cleaning': 'air duct & dryer vent cleaning',
  'air duct': 'air duct & dryer vent cleaning',
  'dryer vent': 'air duct & dryer vent cleaning',
  'vent cleaning': 'air duct & dryer vent cleaning',
  pond: 'pond & water feature services',
  'koi pond': 'pond & water feature services',
  'water feature': 'pond & water feature services',
  'pond cleaning': 'pond & water feature services',
  ac: 'HVAC',
  'a/c': 'HVAC',
  'air conditioning': 'HVAC',
  heating: 'HVAC',
  furnace: 'HVAC',
  'heating and cooling': 'HVAC',
  hvacr: 'HVAC',
  carpenter: 'cabinetry & millwork',
  carpentry: 'cabinetry & millwork',
  handyman: 'handyman work',
  cleaner: 'cleaning',
  'house cleaning': 'cleaning',
  maid: 'cleaning',
  janitorial: 'cleaning',
  contractor: 'remodeling & renovation',
  remodeler: 'remodeling & renovation',
  renovation: 'remodeling & renovation',
  builder: 'remodeling & renovation',
  kitchen: 'remodeling & renovation',
  bathroom: 'remodeling & renovation',
  mason: 'masonry',
  bricklaying: 'masonry',
  paver: 'paving & asphalt',
  asphalt: 'paving & asphalt',
  driveway: 'paving & asphalt',
  locksmith: 'locksmith work',
  exterminator: 'pest control',
  pest: 'pest control',
  'tree service': 'tree care & removal',
  arborist: 'tree care & removal',
  'stump grinding': 'tree care & removal',
  gutters: 'gutter install & cleaning',
  'power washing': 'pressure washing',
  'soft washing': 'pressure washing',
  snow: 'snow removal & plowing',
  plowing: 'snow removal & plowing',
  hauling: 'junk removal & hauling',
  'junk removal': 'junk removal & hauling',
  demo: 'junk removal & hauling',
  windows: 'window & door installation',
  doors: 'window & door installation',
  glazier: 'window & door installation',
  solar: 'solar installation',
  sprinklers: 'irrigation & sprinklers',
  irrigation: 'irrigation & sprinklers',
  tile: 'tile installation',
  tiling: 'tile installation',
  countertops: 'countertop fabrication & install',
  granite: 'countertop fabrication & install',
  quartz: 'countertop fabrication & install',
  chimney: 'chimney sweep & repair',
  epoxy: 'epoxy & floor coatings',
  'garage floor': 'epoxy & floor coatings',
  restoration: 'water damage & restoration',
  'water damage': 'water damage & restoration',
  mold: 'water damage & restoration',
  septic: 'septic',
  well: 'well & water treatment',
  'water treatment': 'well & water treatment',
  generator: 'standby generator install',
  excavation: 'excavation & grading',
  grading: 'excavation & grading',
  bobcat: 'excavation & grading',
  stucco: 'stucco & plastering',
  plaster: 'stucco & plastering',
  blinds: 'blinds, shades & window treatments',
  shades: 'blinds, shades & window treatments',
  curtains: 'blinds, shades & window treatments',
  detailing: 'auto detailing',
  'car detailing': 'auto detailing',
  inspector: 'home inspection',
  'home inspector': 'home inspection',
  mover: 'moving',
  movers: 'moving',
  deck: 'deck building',
  decking: 'deck building',
  fence: 'fencing',
  carpet: 'carpet & upholstery cleaning',
  upholstery: 'carpet & upholstery cleaning',
  pool: 'pool service',
  spa: 'pool service',
  'hot tub': 'pool service',
  appliance: 'appliance repair',
  'garage door': 'garage door repair & install',
  sheetrock: 'drywall',
  taping: 'drywall',
  spray: 'insulation',
  'spray foam': 'insulation',
};

/** Every trade the product has a word for, in the order the landing pages list them. */
export const TRADE_OPTIONS: string[] = TRADES.map((trade) => trade.work);

export type TradeSuggestion = {
  /** The value that goes in the field. */
  value: string;
  /** Why it is being offered, when that isn't obvious from the value. */
  note?: string;
};

const norm = (value: string) => value.trim().toLowerCase();

/**
 * Up to `limit` suggestions for what is being typed.
 *
 * Ordered by how confident the match is: what starts with the query, then what
 * contains it, then what somebody's own word for the job maps to. A trade whose
 * name begins with the letters typed is nearly always the one meant, and
 * burying it under a substring hit three rows down makes the list feel random.
 *
 * An empty query returns the most common trades rather than nothing — the field
 * is worth opening before you have typed anything, which is the whole point of
 * a picker on a field people otherwise leave blank.
 */
export function suggestTrades(query: string, limit = 6): TradeSuggestion[] {
  const q = norm(query);
  if (!q) return TRADE_OPTIONS.slice(0, limit).map((value) => ({ value }));

  const seen = new Set<string>();
  const out: TradeSuggestion[] = [];
  const add = (value: string, note?: string) => {
    const key = norm(value);
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(note ? { value, note } : { value });
  };

  // Matches inside a word don't count. "ac" is in "contractor", and offering
  // remodeling to somebody typing "ac" is the kind of hit that makes the whole
  // list read as noise — so a later match has to START a word.
  const startsAWord = (haystack: string) =>
    haystack.split(/[^a-z0-9/]+/).some((word) => word.startsWith(q));

  for (const option of TRADE_OPTIONS) if (norm(option).startsWith(q)) add(option);
  for (const option of TRADE_OPTIONS) if (startsAWord(norm(option))) add(option);

  // Then what people call themselves. The note explains the jump, so somebody
  // who typed "electrician" and is offered "electrical work" can see why.
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (alias.startsWith(q)) add(target, `for “${alias}”`);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (startsAWord(alias)) add(target, `for “${alias}”`);
  }

  // Drop a suggestion that is exactly what has been typed — offering it back is
  // a row that does nothing. Character-for-character, NOT normalized: somebody
  // who typed "hvac" should still be offered "HVAC", because the casing is the
  // improvement. This value goes into website headlines.
  return out.filter((suggestion) => suggestion.value !== query.trim());
}
