import { TRADES, type Trade } from './trades';
import { COMMON_TRADE_SLUGS } from './trade-categories';

/**
 * Trade Aliases mapping common colloquial terms, job titles, and synonyms
 * to their standard trade names or works.
 */
export const TRADE_ALIASES: Record<string, string> = {
  electrician: 'electrical work',
  electricians: 'electrical work',
  electric: 'electrical work',
  electrical: 'electrical work',
  sparky: 'electrical work',
  plumber: 'plumbing',
  plumbers: 'plumbing',
  plumbing: 'plumbing',
  roofer: 'roofing',
  roofers: 'roofing',
  roofing: 'roofing',
  roofs: 'roofing',
  painter: 'painting',
  painters: 'painting',
  painting: 'painting',
  paints: 'painting',
  landscaper: 'landscaping',
  landscapers: 'landscaping',
  landscaping: 'landscaping',
  landscape: 'landscaping',
  gardening: 'landscaping',
  gardener: 'landscaping',
  hardscaping: 'landscaping',
  hardscape: 'landscaping',
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
  'air conditioner': 'HVAC',
  hvac: 'HVAC',
  heating: 'HVAC',
  furnace: 'HVAC',
  'heating and cooling': 'HVAC',
  hvacr: 'HVAC',
  carpenter: 'cabinetry & millwork',
  carpenters: 'cabinetry & millwork',
  carpentry: 'cabinetry & millwork',
  handyman: 'handyman work',
  handymen: 'handyman work',
  'handy man': 'handyman work',
  cleaner: 'cleaning',
  cleaners: 'cleaning',
  cleaning: 'cleaning',
  'house cleaning': 'cleaning',
  maid: 'cleaning',
  janitorial: 'cleaning',
  janitor: 'cleaning',
  contractor: 'remodeling & renovation',
  contractors: 'remodeling & renovation',
  remodeler: 'remodeling & renovation',
  remodelers: 'remodeling & renovation',
  remodeling: 'remodeling & renovation',
  renovation: 'remodeling & renovation',
  builder: 'remodeling & renovation',
  builders: 'remodeling & renovation',
  kitchen: 'remodeling & renovation',
  bathroom: 'remodeling & renovation',
  mason: 'masonry',
  masons: 'masonry',
  masonry: 'masonry',
  bricklaying: 'masonry',
  bricklayer: 'masonry',
  paver: 'paving & asphalt',
  pavers: 'paving & asphalt',
  paving: 'paving & asphalt',
  asphalt: 'paving & asphalt',
  driveway: 'paving & asphalt',
  locksmith: 'locksmith work',
  locksmiths: 'locksmith work',
  exterminator: 'pest control',
  exterminators: 'pest control',
  pest: 'pest control',
  'pest control': 'pest control',
  'tree service': 'tree care & removal',
  'tree services': 'tree care & removal',
  arborist: 'tree care & removal',
  arborists: 'tree care & removal',
  'tree care': 'tree care & removal',
  'stump grinding': 'tree care & removal',
  gutters: 'gutter install & cleaning',
  gutter: 'gutter install & cleaning',
  'gutter cleaning': 'gutter install & cleaning',
  'power washing': 'pressure washing',
  'pressure washing': 'pressure washing',
  'soft washing': 'pressure washing',
  powerwash: 'pressure washing',
  snow: 'snow removal & plowing',
  plowing: 'snow removal & plowing',
  'snow removal': 'snow removal & plowing',
  hauling: 'junk removal & hauling',
  'junk removal': 'junk removal & hauling',
  junk: 'junk removal & hauling',
  demo: 'junk removal & hauling',
  demolition: 'junk removal & hauling',
  windows: 'window & door installation',
  window: 'window & door installation',
  doors: 'window & door installation',
  door: 'window & door installation',
  glazier: 'window & door installation',
  solar: 'solar installation',
  'solar panels': 'solar installation',
  sprinklers: 'irrigation & sprinklers',
  sprinkler: 'irrigation & sprinklers',
  irrigation: 'irrigation & sprinklers',
  tile: 'tile installation',
  tiling: 'tile installation',
  tiler: 'tile installation',
  countertops: 'countertop fabrication & install',
  countertop: 'countertop fabrication & install',
  granite: 'countertop fabrication & install',
  quartz: 'countertop fabrication & install',
  chimney: 'chimney sweep & repair',
  'chimney sweep': 'chimney sweep & repair',
  epoxy: 'epoxy & floor coatings',
  'garage floor': 'epoxy & floor coatings',
  restoration: 'water damage & restoration',
  'water damage': 'water damage & restoration',
  mold: 'water damage & restoration',
  'mold remediation': 'water damage & restoration',
  septic: 'septic',
  'septic tank': 'septic',
  well: 'well & water treatment',
  'water treatment': 'well & water treatment',
  generator: 'standby generator install',
  generators: 'standby generator install',
  excavation: 'excavation & grading',
  excavator: 'excavation & grading',
  grading: 'excavation & grading',
  bobcat: 'excavation & grading',
  stucco: 'stucco & plastering',
  plaster: 'stucco & plastering',
  plastering: 'stucco & plastering',
  drywall: 'drywall',
  sheetrock: 'drywall',
  taping: 'drywall',
  blinds: 'blinds, shades & window treatments',
  shades: 'blinds, shades & window treatments',
  curtains: 'blinds, shades & window treatments',
  detailing: 'auto detailing',
  'car detailing': 'auto detailing',
  'auto detailing': 'auto detailing',
  inspector: 'home inspection',
  'home inspector': 'home inspection',
  'home inspection': 'home inspection',
  mover: 'moving',
  movers: 'moving',
  moving: 'moving',
  deck: 'deck building',
  decks: 'deck building',
  decking: 'deck building',
  'deck builder': 'deck building',
  fence: 'fencing',
  fences: 'fencing',
  fencing: 'fencing',
  carpet: 'carpet & upholstery cleaning',
  'carpet cleaning': 'carpet & upholstery cleaning',
  upholstery: 'carpet & upholstery cleaning',
  pool: 'pool service',
  pools: 'pool service',
  'pool service': 'pool service',
  'pool cleaning': 'pool service',
  spa: 'pool service',
  'hot tub': 'pool service',
  appliance: 'appliance repair',
  appliances: 'appliance repair',
  'appliance repair': 'appliance repair',
  'garage door': 'garage door repair & install',
  'garage doors': 'garage door repair & install',
  insulation: 'insulation',
  spray: 'insulation',
  'spray foam': 'insulation',
  dock: 'dock & seawall construction',
  docks: 'dock & seawall construction',
  seawall: 'dock & seawall construction',
  'boat lift': 'boat lift sales, installation & repair',
  'hot tub moving': 'hot tub moving, repair & maintenance',
  backflow: 'backflow testing, certification & repair',
  greenhouse: 'custom greenhouse design & construction',
  'outdoor kitchen': 'custom outdoor kitchen & BBQ island construction',
  'grain bin': 'grain bin & agricultural silo construction',
  'oil tank': 'heating oil tank removal & soil remediation',
  tuckpointing: 'historic masonry restoration & tuckpointing',
  storefront: 'commercial storefront glass & entrance systems',
  'solar battery': 'solar battery storage & backup system installation',
  'central vac': 'central vacuum system installation & repair',
  'septic pumping': 'septic tank pumping & system maintenance',
  'home theater': 'custom home theater & media room installation',
  fireplace: 'fireplace restoration, refacing & conversion',
  'drop ceiling': 'acoustical drop ceiling installation & repair',
  asbestos: 'certified asbestos & lead abatement services',
  biohazard: 'biohazard, trauma & crime scene remediation',
  graffiti: 'graffiti removal & anti-graffiti surface protection',
  odor: 'professional odor removal & decontamination services',
  'floor care': 'commercial carpet, tile & hard floor care',
  hydraulic: 'mobile hydraulic hose repair & replacement',
  welding: 'mobile welding, fabrication & heavy equipment repair',
  welder: 'mobile welding, fabrication & heavy equipment repair',
  rigging: 'safe, machinery & heavy equipment rigging',
  aircraft: 'aircraft detailing, paint protection & interior cleaning',
  pickleball: 'sports & pickleball court construction',
  polyjacking: 'concrete leveling & polyjacking',
  mudjacking: 'concrete leveling & polyjacking',
  sealcoating: 'driveway & parking lot sealcoating',
  'pole barn': 'pole barn & post-frame construction',
  'farm fencing': 'agricultural & farm fencing',
  'pooper scooper': 'pet waste removal & yard sanitation',
  striping: 'parking lot striping & line painting',
  'pet grooming': 'mobile pet grooming',
  'dog grooming': 'mobile pet grooming',
  'knife sharpening': 'mobile knife & tool sharpening',
  'party rental': 'party tent & event equipment rentals',
  'tent rental': 'party tent & event equipment rentals',
};

/**
 * Calculates Damerau-Levenshtein distance between strings a and b,
 * accounting for insertion, deletion, substitution, and adjacent transposition.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const la = a.length;
  const lb = b.length;
  const d: number[][] = Array.from({ length: la + 1 }, () => new Array<number>(lb + 1).fill(0));

  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[la][lb];
}

/**
 * Phonetic normalization to catch sound-alike spelling variants.
 * e.g., "electrishun" -> "elektrshn", "conkreet" -> "konkret"
 */
export function phoneticNormalize(str: string): string {
  const norm = str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(?:tion|sion|cian|shun|tian|cean)/g, 'shn')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c(?=[aou])/g, 'k')
    .replace(/c/g, 'k')
    .replace(/dg/g, 'j')
    .replace(/ee|ea/g, 'e')
    .replace(/oo|ou/g, 'u')
    .replace(/igh/g, 'i')
    .replace(/wr/g, 'r')
    .replace(/kn/g, 'n')
    .replace(/mb$/g, 'm')
    .replace(/(.)\1+/g, '$1');

  return norm.length > 3 ? norm.replace(/e$/, '') : norm;
}

/**
 * Computes match score between a trade and a user search query with typo tolerance.
 * Higher score = stronger match. 0 = no match.
 */
export function scoreTradeMatch(trade: Trade, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const compactQ = q.replace(/[^a-z0-9]/g, '');
  const phoneQ = phoneticNormalize(q);

  let maxScore = 0;

  // Build list of candidate strings for this trade
  const candidates: string[] = [
    trade.name,
    trade.work,
    trade.slug.replace(/-/g, ' '),
    ...trade.services,
  ];

  // Also include aliases mapped to this trade
  for (const [alias, targetWork] of Object.entries(TRADE_ALIASES)) {
    if (
      targetWork.toLowerCase() === trade.work.toLowerCase() ||
      targetWork.toLowerCase() === trade.name.toLowerCase()
    ) {
      candidates.push(alias);
    }
  }

  // Singular and plural variants
  const nameLower = trade.name.toLowerCase();
  if (nameLower.endsWith('s')) candidates.push(nameLower.slice(0, -1));
  if (nameLower.endsWith('ers')) candidates.push(nameLower.slice(0, -3) + 'ing');
  if (nameLower.endsWith('ors')) candidates.push(nameLower.slice(0, -3) + 'ing');

  for (const rawCandidate of candidates) {
    const c = rawCandidate.toLowerCase();
    const compactC = c.replace(/[^a-z0-9]/g, '');
    const phoneC = phoneticNormalize(c);

    // 1. Exact match on full candidate or compact string
    if (q === c || (compactQ.length >= 2 && compactQ === compactC)) {
      const isPrimary = c === trade.name.toLowerCase() || c === trade.work.toLowerCase() || c in TRADE_ALIASES;
      maxScore = Math.max(maxScore, isPrimary ? 1000 : 900);
      continue;
    }

    // 2. Prefix match on full candidate
    if (c.startsWith(q) || (compactQ.length >= 2 && compactC.startsWith(compactQ))) {
      const isPrimary = c === trade.name.toLowerCase() || c === trade.work.toLowerCase() || c in TRADE_ALIASES;
      const penalty = Math.min(120, (c.length - q.length) * 4);
      maxScore = Math.max(maxScore, (isPrimary ? 850 : 750) - penalty);
      continue;
    }

    // 3. Word-level start-with match
    const words = c.split(/[^a-z0-9/]+/).filter(Boolean);
    let wordPrefixMatched = false;
    for (const w of words) {
      if (w.startsWith(q)) {
        const isPrimary = c === trade.name.toLowerCase() || c === trade.work.toLowerCase() || c in TRADE_ALIASES;
        maxScore = Math.max(maxScore, isPrimary ? 720 : 620);
        wordPrefixMatched = true;
        break;
      }
    }
    if (wordPrefixMatched) continue;

    // 4. Phonetic exact match
    if (phoneQ.length >= 3 && phoneC === phoneQ) {
      maxScore = Math.max(maxScore, 580);
      continue;
    }

    // 5. Phonetic prefix match
    if (phoneQ.length >= 3 && phoneC.startsWith(phoneQ)) {
      maxScore = Math.max(maxScore, 520);
      continue;
    }

    // 6. Typo / Edit Distance on full candidate
    if (q.length >= 3) {
      const dist = damerauLevenshtein(q, c);
      const compactDist = damerauLevenshtein(compactQ, compactC);
      const bestDist = Math.min(dist, compactDist);

      // Short queries (3-4 chars) require matching initial letter to avoid random 1-char false positives
      const firstLetterMatch = q[0] === c[0] || (compactQ.length > 0 && compactC.length > 0 && compactQ[0] === compactC[0]);

      if (bestDist === 1 && (q.length >= 4 || firstLetterMatch)) {
        maxScore = Math.max(maxScore, 480);
        continue;
      } else if (bestDist === 2 && q.length >= 5 && c.length >= 5 && firstLetterMatch) {
        maxScore = Math.max(maxScore, 380);
        continue;
      } else if (bestDist === 3 && q.length >= 8 && c.length >= 8 && firstLetterMatch) {
        maxScore = Math.max(maxScore, 280);
        continue;
      }
    }

    // 7. Typo / Edit Distance on individual words inside candidate
    if (q.length >= 3) {
      for (const w of words) {
        if (w.length < 3) continue;
        const wDist = damerauLevenshtein(q, w);
        const firstLetterMatch = q[0] === w[0];

        if (wDist === 1 && (q.length >= 4 || firstLetterMatch)) {
          maxScore = Math.max(maxScore, 420);
          break;
        } else if (wDist === 2 && q.length >= 5 && w.length >= 5 && firstLetterMatch) {
          maxScore = Math.max(maxScore, 320);
          break;
        }

        // Phonetic word match
        const phoneW = phoneticNormalize(w);
        if (phoneQ.length >= 3 && phoneW === phoneQ) {
          maxScore = Math.max(maxScore, 440);
          break;
        } else if (phoneQ.length >= 4 && phoneW.length >= 4 && damerauLevenshtein(phoneQ, phoneW) <= 1 && firstLetterMatch) {
          maxScore = Math.max(maxScore, 340);
          break;
        }
      }
    }
  }

  // Boost common trades slightly for tie-breaking
  if (maxScore > 0 && COMMON_TRADE_SLUGS.includes(trade.slug)) {
    maxScore += 5;
  }

  return maxScore;
}

/**
 * Searches and ranks trades with typo tolerance and fuzzy matching.
 */
export function matchTrades(
  query: string,
  options: { limit?: number; threshold?: number } = {},
): Trade[] {
  const q = query.trim().toLowerCase();
  const limit = options.limit ?? 5;
  const threshold = options.threshold ?? 200;

  if (!q) {
    return TRADES.slice(0, limit);
  }

  const scored: Array<{ trade: Trade; score: number }> = [];

  for (const trade of TRADES) {
    const score = scoreTradeMatch(trade, q);
    if (score >= threshold) {
      scored.push({ trade, score });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.trade);
}

/**
 * Finds the single best matching trade for a query, or null if no confident match exists.
 */
export function findBestTradeMatch(query: string, threshold = 200): Trade | null {
  const matches = matchTrades(query, { limit: 1, threshold });
  return matches[0] ?? null;
}
