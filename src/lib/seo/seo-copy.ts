// Deterministic SEO copy generator for contractor sites.
//
// Pure, dependency-free, and self-contained (no project imports) so it can be
// unit-tested directly with `node --experimental-strip-types`. Given normalized
// contractor data it builds several valid title/description variations and
// picks one by hashing a stable seed (the site id) — so a given contractor gets
// the same copy on every page load, while different contractors get different
// shapes. A `variantOffset` rotates to the next variation for a "regenerate"
// button.
//
// Guarantees: titles never exceed SEO_TITLE_MAX, descriptions never exceed
// SEO_DESC_MAX, no clause is ever cut mid-word, the primary service is never
// repeated, separators never sit between identical text, and the output is
// never blank and never contains "undefined"/"null".

export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MAX = 160;
export const SEO_DESC_MIN = 130;

export type SeoFeature =
  | 'instantQuotes'
  | 'onlineScheduling'
  | 'instantEstimate'
  | 'textUpdates'
  | 'paymentRequests'
  | 'jobDashboard'
  | 'statusAnytime';

export type SeoContractorInput = {
  /** Stable id (site id) driving deterministic variation. Falls back to name. */
  seed?: string | null;
  businessName?: string | null;
  /** e.g. "Window Cleaning". Falls back to `trade`. */
  primaryService?: string | null;
  trade?: string | null;
  city?: string | null;
  region?: string | null;
  /** Free-text area, e.g. "Dayton, OH and surrounding communities". */
  serviceArea?: string | null;
  /** Short contractor-provided phrase, e.g. "Family Owned". */
  differentiator?: string | null;
  /** Enabled Let's Get Quoted features the copy may mention. */
  features?: SeoFeature[];
};

export type SeoCopy = { title: string; description: string };

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

function clean(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

// A word keeps its given casing when it has an internal capital (ClearView) or
// is all-caps (HVAC, OH); otherwise it's normalized.
function hasIntentionalCaps(word: string): boolean {
  return /[A-Z]/.test(word.slice(1)) || (word.length > 1 && word === word.toUpperCase());
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'vs']);

// Title Case for services/phrases (not business names, which are preserved).
function titleCase(text: string): string {
  const words = clean(text).split(' ');
  return words
    .map((word, index) => {
      if (!word) return word;
      if (hasIntentionalCaps(word)) return word;
      const lower = word.toLowerCase();
      if (index !== 0 && index !== words.length - 1 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// Lowercase a service for mid-sentence use, but keep intentional caps.
function midCase(text: string): string {
  return clean(text)
    .split(' ')
    .map((word) => (hasIntentionalCaps(word) ? word : word.toLowerCase()))
    .join(' ');
}

function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Collapse an immediately repeated word ("Cleaning Cleaning" -> "Cleaning").
function collapseRepeats(text: string): string {
  return text.replace(/\b(\w[\w'&.-]*)(\s+\1)\b/gi, '$1');
}

// FNV-1a — small, stable, no dependencies. Same seed => same number always.
function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function containsBadToken(text: string): boolean {
  return /\b(undefined|null|NaN)\b/i.test(text) || /\|\s*$/.test(text) || /^\s*\|/.test(text);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

type NormalizedInput = {
  seed: string;
  seedNumber: number;
  businessName: string;
  service: string; // Title Case, e.g. "Window Cleaning"
  serviceLower: string; // mid-sentence, e.g. "window cleaning"
  city: string;
  region: string;
  locationLabel: string; // "Dayton, OH" | "Dayton" | serviceArea | ''
  differentiator: string;
  features: SeoFeature[];
};

const AREA_FILLER = /\b(and\s+surrounding\s+(?:communities|areas|towns)|surrounding\s+(?:communities|areas|towns)|and\s+nearby(?:\s+areas)?|metro(?:\s+area)?|greater|area|region)\b/gi;

// Derive a specific city + region from the free-text service area when the
// explicit fields are missing. "Dayton, OH and surrounding communities" ->
// city "Dayton", region "OH".
function deriveLocation(input: SeoContractorInput): { city: string; region: string; locationLabel: string } {
  let city = clean(input.city);
  let region = clean(input.region);
  const serviceArea = clean(input.serviceArea);

  if ((!city || !region) && serviceArea) {
    const segments = serviceArea.split(',').map((part) => part.trim()).filter(Boolean);
    if (!city && segments[0]) {
      const primary = segments[0].replace(AREA_FILLER, '').replace(/\s+/g, ' ').trim();
      if (primary) city = titleCase(primary);
    }
    if (!region && segments[1]) {
      const maybeState = segments[1].replace(AREA_FILLER, '').trim();
      if (/^[A-Za-z]{2}$/.test(maybeState)) region = maybeState.toUpperCase();
    }
  } else if (city) {
    city = titleCase(city);
  }
  if (region && /^[a-z]{2}$/i.test(region)) region = region.toUpperCase();

  let locationLabel = '';
  if (city && region) locationLabel = `${city}, ${region}`;
  else if (city) locationLabel = city;
  else if (serviceArea) locationLabel = serviceArea.replace(AREA_FILLER, '').replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim();

  return { city, region, locationLabel };
}

function normalize(input: SeoContractorInput): NormalizedInput {
  const businessName = clean(input.businessName);
  const rawService = clean(input.primaryService) || clean(input.trade);
  const service = rawService ? titleCase(rawService) : '';
  const serviceLower = rawService ? midCase(rawService) : '';
  const { city, region, locationLabel } = deriveLocation(input);
  const differentiator = clean(input.differentiator);
  const seed = clean(input.seed) || businessName || service || 'lgq';

  const features = Array.isArray(input.features) ? input.features.filter((feature, index, all) => all.indexOf(feature) === index) : [];

  return { seed, seedNumber: hashSeed(seed), businessName, service, serviceLower, city, region, locationLabel, differentiator, features };
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

function isValidTitle(title: string, service: string): boolean {
  const value = title.trim();
  if (!value || value.length > SEO_TITLE_MAX) return false;
  if (containsBadToken(value)) return false;
  // Separator sides must not be identical.
  if (value.includes('|')) {
    const [left, right] = value.split('|').map((part) => part.trim().toLowerCase());
    if (!left || !right || left === right) return false;
  }
  // Never repeat the primary service.
  if (service) {
    const needle = service.toLowerCase();
    const haystack = value.toLowerCase();
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    if (count > 1) return false;
  }
  return true;
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Rich (multi-signal) titles are preferred; the single-token fallbacks are only
// used when no rich variation is valid, so a strong title like
// "GreenEdge Landscaping | Miami, FL" always wins over a bare "Lawn Care".
function buildTitleCandidates(n: NormalizedInput): { rich: string[]; fallback: string[] } {
  const { businessName, service, city, locationLabel, differentiator } = n;
  const nameHasService = Boolean(service) && businessName.toLowerCase().includes(service.toLowerCase());
  const rich: string[] = [];
  const fallback: string[] = [];
  const add = (list: string[], value: string) => list.push(collapseRepeats(clean(value)));

  if (businessName && locationLabel) add(rich, `${businessName} | ${locationLabel}`);
  if (service && city && businessName && !nameHasService) add(rich, `${service} in ${city} | ${businessName}`);
  if (businessName && service && !nameHasService) add(rich, `${businessName} | ${service}`);
  if (service && city) add(rich, `${service} in ${city}`);
  if (businessName && differentiator) add(rich, `${businessName} | ${differentiator}`);
  if (service && city) add(rich, `Book ${service} in ${city}`);
  if (service) add(rich, `${service} With Instant Quotes`);
  if (businessName && service && !nameHasService) add(rich, `${businessName} ${service}`);
  if (service && locationLabel && !city) add(rich, `${service} in ${locationLabel}`);

  if (businessName) add(fallback, businessName);
  if (service) add(fallback, service);

  return { rich: dedupePreserveOrder(rich), fallback: dedupePreserveOrder(fallback) };
}

function selectTitle(n: NormalizedInput, variantOffset: number): string {
  const { rich, fallback } = buildTitleCandidates(n);
  const validRich = rich.filter((title) => isValidTitle(title, n.service));
  if (validRich.length > 0) return validRich[(n.seedNumber + variantOffset) % validRich.length];
  const validFallback = fallback.filter((title) => isValidTitle(title, n.service));
  if (validFallback.length > 0) return validFallback[(n.seedNumber + variantOffset) % validFallback.length];
  // Last-resort guaranteed-valid title, trimmed to a word boundary.
  const last = n.businessName || n.service || 'Local Home Services';
  return trimToWordBoundary(last, SEO_TITLE_MAX) || 'Local Home Services';
}

// ---------------------------------------------------------------------------
// Description generation
// ---------------------------------------------------------------------------

const FEATURE_PHRASES: Record<SeoFeature, string[]> = {
  instantQuotes: ['get an instant quote', 'request an instant quote', 'start with an instant quote'],
  onlineScheduling: ['schedule online', 'book online', 'lock in a time online'],
  instantEstimate: ['see a ballpark price right away', 'get an instant price estimate'],
  textUpdates: ['follow your job with text updates', 'get text-message updates', 'stay posted by text'],
  paymentRequests: ['receive clear payment requests', 'pay through simple, secure requests'],
  jobDashboard: ['track everything from your Job Dashboard', 'follow every step from your dashboard'],
  statusAnytime: ['check your job status anytime', 'see where your job stands whenever you like'],
};

const FEATURE_NOUNS: Record<SeoFeature, string> = {
  instantQuotes: 'instant quotes',
  onlineScheduling: 'easy online scheduling',
  instantEstimate: 'instant price estimates',
  textUpdates: 'text updates',
  paymentRequests: 'transparent payments',
  jobDashboard: 'a job dashboard',
  statusAnytime: 'anytime status checks',
};

const DEFAULT_FEATURES: SeoFeature[] = ['instantQuotes', 'onlineScheduling', 'textUpdates'];

// Rotate the feature list by the seed so different contractors lead with
// different features, then return them in that stable order.
function orderedFeatures(n: NormalizedInput): SeoFeature[] {
  const base = n.features.length ? n.features : DEFAULT_FEATURES;
  if (base.length <= 1) return base.slice();
  const start = n.seedNumber % base.length;
  return [...base.slice(start), ...base.slice(0, start)];
}

// Pick a phrasing for a feature, varied by seed.
function phraseFor(feature: SeoFeature, seed: number): string {
  const options = FEATURE_PHRASES[feature];
  return options[seed % options.length];
}

// Join feature clauses into one sentence tail with an Oxford comma.
function joinList(items: string[]): string {
  const parts = items.map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

// Assemble a head clause + feature clauses into a finished sentence. If the head
// already ends the sentence (a question), the features become a second sentence.
function assemble(head: string, features: string[]): string {
  const cleanHead = collapseRepeats(clean(head));
  const tail = joinList(features);
  if (!tail) return /[?.!]$/.test(cleanHead) ? cleanHead : `${cleanHead}.`;
  if (/[?.!]$/.test(cleanHead)) return `${cleanHead} ${capitalizeFirst(tail)}.`;
  return `${cleanHead}, ${tail}.`;
}

function trimToWordBoundary(text: string, max: number): string {
  const value = text.trim();
  if (value.length <= max) return value;
  const slice = value.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : value.slice(0, max)).replace(/[\s,;:|-]+$/, '').trim();
}

// Build a description from a head clause and an ordered list of feature clauses,
// dropping trailing feature clauses until it fits SEO_DESC_MAX (never mid-word).
function finalize(head: string, features: string[]): string {
  let used = features.slice();
  let result = assemble(head, used);
  while (result.length > SEO_DESC_MAX && used.length > 0) {
    used = used.slice(0, -1);
    result = assemble(head, used);
  }
  if (result.length > SEO_DESC_MAX) result = `${trimToWordBoundary(head, SEO_DESC_MAX - 1)}.`;
  return result;
}

function buildDescriptionCandidates(n: NormalizedInput): string[] {
  const { businessName, service, serviceLower, city, locationLabel } = n;
  const feats = orderedFeatures(n);
  const at = (i: number): SeoFeature | undefined => feats[i % feats.length];
  const clause = (i: number): string => {
    const feature = at(i);
    return feature ? phraseFor(feature, n.seedNumber + i) : '';
  };
  const inLoc = city ? `in ${city}` : locationLabel ? `in ${locationLabel}` : '';
  const across = locationLabel ? `across ${locationLabel}` : '';
  const nounTail = joinList(feats.slice(0, 3).map((feature) => FEATURE_NOUNS[feature]));
  const candidates: Array<{ head: string; features: string[] }> = [];

  if (businessName) {
    const forService = serviceLower ? `for ${serviceLower}` : '';
    candidates.push({ head: joinWords(['Get an instant quote from', businessName, forService, inLoc]), features: [clause(1), clause(2)] });
  }
  if (businessName && serviceLower) {
    candidates.push({ head: joinWords(['Book', serviceLower, 'with', businessName, inLoc]), features: [clause(3), clause(4)] });
    // Fuller, three-benefit variant that reliably lands in the 130-155 band.
    candidates.push({ head: joinWords(['Choose', businessName, 'for', serviceLower, inLoc]), features: [clause(11), clause(12), clause(13)] });
  }
  if (businessName && serviceLower) {
    candidates.push({ head: joinWords([businessName, 'provides', serviceLower, across]), features: nounTail ? [`with ${nounTail}`] : [] });
  }
  if (serviceLower && (city || locationLabel)) {
    candidates.push({ head: `${joinWords(['Need', serviceLower, inLoc])}?`, features: ['request a quote', clause(5), clause(6)] });
  }
  if (serviceLower) {
    candidates.push({ head: joinWords([capitalizeFirst(serviceLower), inLoc, 'made easy']), features: [clause(7), clause(8)] });
  }
  if (businessName) {
    const lead = locationLabel ? `${businessName} serves ${locationLabel}` : `${businessName} is ready to help`;
    candidates.push({ head: lead, features: [clause(9), clause(10)] });
  }

  return candidates
    .map(({ head, features }) => finalize(head, features.filter(Boolean)))
    .filter((value) => value && !containsBadToken(value));
}

function joinWords(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}

function selectDescription(n: NormalizedInput, variantOffset: number): string {
  const candidates = buildDescriptionCandidates(n);
  if (candidates.length === 0) {
    const head = n.businessName || (n.service ? `${n.service} services` : 'Local home services');
    return finalize(head, [phraseFor('instantQuotes', n.seedNumber), phraseFor('onlineScheduling', n.seedNumber + 1)]);
  }
  // Prefer candidates in the ideal 130-160 band. When none reach the target,
  // rotate among the longest few (closest to the band) rather than risking a
  // very short description.
  const ideal = candidates.filter((value) => value.length >= SEO_DESC_MIN);
  if (ideal.length > 0) return ideal[(n.seedNumber + variantOffset) % ideal.length];
  const longest = [...candidates].sort((a, b) => b.length - a.length).slice(0, Math.min(3, candidates.length));
  return longest[(n.seedNumber + variantOffset) % longest.length];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a stable-but-varied SEO title + description for a contractor.
 * `variantOffset` (default 0) rotates to a different valid variation without
 * changing the input — used by the "Regenerate" button. Output is always
 * within the character limits, never blank, and never contains placeholders.
 */
export function generateSeoCopy(input: SeoContractorInput, variantOffset = 0): SeoCopy {
  const normalized = normalize(input);
  const offset = Number.isFinite(variantOffset) ? Math.abs(Math.trunc(variantOffset)) : 0;
  return {
    title: selectTitle(normalized, offset),
    description: selectDescription(normalized, offset),
  };
}

/**
 * Resolve the SEO copy to render, preferring the contractor's saved (manually
 * edited) values and generating only what's blank. A saved value is NEVER
 * overwritten here — regeneration happens only on an explicit user action.
 * Each field is resolved independently, so a saved title with a blank
 * description still yields a generated description.
 */
export function resolveSeoCopy(
  saved: { title?: string | null; description?: string | null },
  input: SeoContractorInput,
): SeoCopy {
  const savedTitle = clean(saved.title);
  const savedDescription = clean(saved.description);
  if (savedTitle && savedDescription) return { title: savedTitle, description: savedDescription };
  const generated = generateSeoCopy(input);
  return {
    title: savedTitle || generated.title,
    description: savedDescription || generated.description,
  };
}

// The most specific schema.org LocalBusiness subtype we can justify from the
// contractor's trade text, falling back to the general construction type. Only
// returns valid subtypes of HomeAndConstructionBusiness.
const SCHEMA_TYPE_RULES: Array<[RegExp, string]> = [
  [/\b(hvac|heating|cooling|air[\s-]?condition|furnace)\b/i, 'HVACBusiness'],
  [/\bplumb/i, 'Plumber'],
  [/\belectric/i, 'Electrician'],
  [/\broof/i, 'RoofingContractor'],
  [/\bpaint/i, 'HousePainter'],
  [/\block?smith\b/i, 'Locksmith'],
  [/\bmov(?:ing|ers)\b/i, 'MovingCompany'],
  [/\b(?:remodel|renovat|general contractor|construction|builder|carpentry|deck|kitchen|bath)/i, 'GeneralContractor'],
];

export function resolveSchemaType(text: string): string {
  const value = clean(text);
  for (const [pattern, type] of SCHEMA_TYPE_RULES) {
    if (pattern.test(value)) return type;
  }
  return 'HomeAndConstructionBusiness';
}

// Exported for tests.
export const __test = { titleCase, midCase, deriveLocation, buildTitleCandidates, isValidTitle, hashSeed, collapseRepeats };
