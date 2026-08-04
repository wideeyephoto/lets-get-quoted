// What work actually costs, and where each number came from.
//
// Three separate ideas live here because they share one failure mode: a cost
// that looks known when it isn't. An un-costed price-book line reading as 100%
// margin, a crew hour priced at the bare wage, and a figure somebody typed from
// memory sitting next to one read off a supplier invoice — each of them makes a
// margin look better than it is, and a contractor only finds out at the end of
// the year.

// -- Loaded labour cost -------------------------------------------------------

/**
 * Employer burden as a percentage on top of the wage: payroll taxes, workers'
 * comp, unemployment, paid time off. A crew member on $30/hr does not cost
 * $30/hr, and quoting off the bare wage is how a job loses money invisibly.
 *
 * A per-person value of null means "use the account's figure" — 0 is a real and
 * different answer, so it can't stand in for "not set".
 */
export function resolveBurdenPct(crewBurdenPct: number | null | undefined, accountDefaultPct: number | null | undefined): number {
  const own = toFiniteOrNull(crewBurdenPct);
  if (own !== null) return clampBurden(own);
  return clampBurden(toFiniteOrNull(accountDefaultPct) ?? DEFAULT_BURDEN_PCT);
}

export const MAX_BURDEN_PCT = 200;

/**
 * Where an account starts, for both costing settings.
 *
 * Both shipped at 0 — the one value that makes each feature do nothing. A 0%
 * burden claims a $30/hr crew member costs $30/hr, which is the invisible loss
 * this whole file exists to stop, and a 0% margin floor never flags anything.
 *
 * 40% is the top of the 20–40% the settings card already calls industry typical;
 * 15% is the middle of the 10–20% it already calls the recommended range. The
 * advice was on screen and the defaults simply didn't follow it.
 *
 * These are STARTING points, not floors: 0 remains legal and meaningful, and an
 * owner who chooses it keeps it. The database carries the same two numbers as
 * column defaults (migrations/2026-08-04-cost-defaults.sql) so a fresh account is
 * correct before any code reads it; these constants cover a missing row.
 */
export const DEFAULT_BURDEN_PCT = 40;
export const DEFAULT_MIN_MARGIN_PCT = 15;

function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampBurden(pct: number): number {
  return Math.min(MAX_BURDEN_PCT, Math.max(0, pct));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What a shift costs the business, split in two.
 *
 * `wages` is what the person earns and is the ONLY figure payroll may read.
 * `burden` is the employer-side add-on. They are kept apart all the way to the
 * database because crew pay is computed from the wage column — folding burden
 * into it would quietly inflate every hourly paycheque.
 */
export function loadedLabourCost(hours: number, wageRate: number, burdenPct: number): { wages: number; burden: number; total: number } {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const safeRate = Number.isFinite(wageRate) && wageRate > 0 ? wageRate : 0;
  const wages = round2(safeHours * safeRate);
  const burden = round2(wages * (clampBurden(burdenPct) / 100));
  return { wages, burden, total: round2(wages + burden) };
}

/** "$30.00/hr costs you $37.50/hr" — the sentence that makes burden land. */
export function loadedHourlyRate(wageRate: number, burdenPct: number): number {
  const safeRate = Number.isFinite(wageRate) && wageRate > 0 ? wageRate : 0;
  return round2(safeRate * (1 + clampBurden(burdenPct) / 100));
}

// -- Price-book margin --------------------------------------------------------

export type LineMargin = {
  /** null when the cost is unknown. NOT zero — see the note below. */
  margin: number | null;
  profit: number | null;
  known: boolean;
};

/**
 * Margin on one price-book line.
 *
 * Returns null rather than 1.0 when the cost is unknown. This is the whole
 * reason services.unit_cost is nullable: treating "not filled in" as $0 shows
 * every un-costed line at a perfect 100% margin, which is both wrong and
 * flattering — the two properties that make a number get believed.
 */
export function lineMargin(unitPrice: number | null | undefined, unitCost: number | null | undefined): LineMargin {
  const price = toFiniteOrNull(unitPrice);
  const cost = toFiniteOrNull(unitCost);
  if (price === null || cost === null || price <= 0) return { margin: null, profit: null, known: false };
  const profit = round2(price - cost);
  return { margin: profit / price, profit, known: true };
}

/** How much of the price book has a cost on it. Nags with a number, not a mood. */
export function priceBookCostCoverage(services: { unitCost: number | null }[]): { withCost: number; total: number; pct: number } {
  const total = services.length;
  const withCost = services.filter((s) => toFiniteOrNull(s.unitCost) !== null).length;
  return { withCost, total, pct: total > 0 ? withCost / total : 0 };
}

// -- Cost source --------------------------------------------------------------

export const COST_SOURCES = ['estimated', 'price_book', 'receipt', 'supplier_invoice', 'clocked', 'unspecified'] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/** The sources a person may choose when entering a cost by hand. */
export const SELECTABLE_COST_SOURCES: CostSource[] = ['receipt', 'supplier_invoice', 'price_book', 'estimated'];

export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  estimated: 'Estimated',
  price_book: 'Price book',
  receipt: 'Receipt',
  supplier_invoice: 'Supplier invoice',
  clocked: 'Clocked time',
  unspecified: 'Not recorded',
};

export const COST_SOURCE_NOTE: Record<CostSource, string> = {
  estimated: 'A figure from memory or experience. Fine to start with, worth replacing.',
  price_book: 'Your own rate card.',
  receipt: 'Backed by a receipt you can produce.',
  supplier_invoice: 'Backed by a supplier invoice.',
  clocked: 'Measured by the time clock.',
  unspecified: 'Recorded before cost sources existed. Nobody can say where it came from now.',
};

/** Sources backed by a document. What you'd want behind a disputed invoice. */
const EVIDENCED: ReadonlySet<CostSource> = new Set<CostSource>(['receipt', 'supplier_invoice', 'clocked']);

export function isCostSource(value: unknown): value is CostSource {
  return typeof value === 'string' && (COST_SOURCES as readonly string[]).includes(value);
}

export function normalizeCostSource(value: unknown): CostSource {
  return isCostSource(value) ? value : 'unspecified';
}

export type CostConfidence = { evidenced: number; estimated: number; unrecorded: number; total: number; evidencedPct: number };

/**
 * How much of a job's cost you could actually stand behind.
 *
 * Weighted by MONEY, not by row count: ten $4 estimates next to one $8,000
 * invoice is a well-evidenced job, and counting rows would call it 91% guesswork.
 */
export function costConfidence(costs: { amount: number; burdenAmount?: number; source: CostSource }[]): CostConfidence {
  let evidenced = 0;
  let estimated = 0;
  let unrecorded = 0;
  for (const cost of costs) {
    const value = Math.abs(Number(cost.amount) || 0) + Math.abs(Number(cost.burdenAmount) || 0);
    if (EVIDENCED.has(cost.source)) evidenced += value;
    else if (cost.source === 'unspecified') unrecorded += value;
    else estimated += value;
  }
  const total = round2(evidenced + estimated + unrecorded);
  return {
    evidenced: round2(evidenced),
    estimated: round2(estimated),
    unrecorded: round2(unrecorded),
    total,
    evidencedPct: total > 0 ? evidenced / total : 0,
  };
}

// -- Duplicate expenses -------------------------------------------------------

export type ExistingCost = {
  id: string;
  description: string;
  amount: number;
  supplier: string | null;
  createdAt: string;
};

export type DuplicateMatch = {
  cost: ExistingCost;
  /** Why we think it's the same spend. Shown to the person, not just scored. */
  reasons: string[];
  daysApart: number;
};

/** Two spends this far apart in time are a second trip, not a double entry. */
export const DUPLICATE_WINDOW_DAYS = 14;
/** Amounts within this fraction of each other count as the same figure. */
export const DUPLICATE_AMOUNT_TOLERANCE = 0.02;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordOverlap(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(' ').filter((w) => w.length > 2));
  const right = new Set(normalizeText(b).split(' ').filter((w) => w.length > 2));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/**
 * Costs on this job that look like the one being added.
 *
 * WARNS, never blocks. A contractor genuinely can buy the same $47 of PVC twice
 * in a week, and a system that refuses the second one teaches them to type
 * "$47.01" — at which point the duplicate check has made the data worse.
 *
 * The SAME MONEY is required, plus at least one of: the same supplier, or a
 * description that overlaps.
 *
 * Amount is necessary rather than merely one vote of three, because without it
 * "same supplier + same description" flags a contractor buying PVC fittings from
 * the same yard twice in a week — which is not a mistake, it's Tuesday. What
 * makes a pair look like one spend entered twice is that the figure matches.
 */
export function findDuplicateCosts(
  candidate: { description: string; amount: number; supplier?: string | null; at?: string },
  existing: ExistingCost[],
): DuplicateMatch[] {
  const amount = Math.abs(Number(candidate.amount) || 0);
  if (amount <= 0) return [];
  const at = candidate.at ? Date.parse(candidate.at) : Date.now();
  const supplier = normalizeText(candidate.supplier);

  const matches: DuplicateMatch[] = [];
  for (const cost of existing) {
    const when = Date.parse(cost.createdAt);
    if (!Number.isFinite(when)) continue;
    const daysApart = Math.abs(at - when) / 86_400_000;
    if (daysApart > DUPLICATE_WINDOW_DAYS) continue;

    const other = Math.abs(Number(cost.amount) || 0);
    const sameAmount = other > 0 && Math.abs(other - amount) / Math.max(other, amount) <= DUPLICATE_AMOUNT_TOLERANCE;
    if (!sameAmount) continue; // necessary, not merely one vote

    const reasons: string[] = [other === amount ? 'same amount' : 'almost the same amount'];
    const otherSupplier = normalizeText(cost.supplier);
    if (supplier && otherSupplier && supplier === otherSupplier) reasons.push('same supplier');
    if (wordOverlap(candidate.description, cost.description) >= 0.6) reasons.push('similar description');

    if (reasons.length >= 2) matches.push({ cost, reasons, daysApart: Math.round(daysApart) });
  }

  // Closest in time first: the most recent near-identical spend is the one most
  // likely to be the accidental second entry.
  return matches.sort((a, b) => a.daysApart - b.daysApart).slice(0, 3);
}

/**
 * Every cost on a job that looks like another one already on it.
 *
 * Run over the whole list at render time rather than only at entry, because the
 * duplicate a contractor most wants to know about is usually the one that got
 * saved last week — catching it only at the moment of typing means the pair that
 * already exists stays invisible forever.
 *
 * Keyed by cost id, and only the LATER of each pair is flagged: badging both
 * sides makes it read as though two separate mistakes were made.
 */
export function duplicateCostIds(costs: ExistingCost[]): Map<string, DuplicateMatch> {
  const byOldestFirst = [...costs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const flags = new Map<string, DuplicateMatch>();
  for (let i = 1; i < byOldestFirst.length; i += 1) {
    const later = byOldestFirst[i];
    const earlier = byOldestFirst.slice(0, i);
    const [match] = findDuplicateCosts(
      { description: later.description, amount: later.amount, supplier: later.supplier, at: later.createdAt },
      earlier,
    );
    if (match) flags.set(later.id, match);
  }
  return flags;
}

export function describeDuplicate(match: DuplicateMatch): string {
  const when = match.daysApart === 0 ? 'today' : match.daysApart === 1 ? 'yesterday' : `${match.daysApart} days ago`;
  return `“${match.cost.description}” was logged ${when} — ${match.reasons.join(', ')}.`;
}

// -- Minimum margin -----------------------------------------------------------

export type MarginVerdict = {
  /** Below the owner's floor. */
  below: boolean;
  /** Losing money outright, which is worth saying differently. */
  losing: boolean;
  /** Silent when there's no revenue yet, or no floor set. */
  quiet: boolean;
  message: string | null;
};

/**
 * Whether to warn about a job's margin.
 *
 * Quiet by default in two cases that would otherwise cry wolf: a job with no
 * revenue recorded yet (every new job would fire), and an owner who hasn't set a
 * floor. A warning that appears on everything gets dismissed on everything.
 */
export function marginVerdict(input: {
  revenue: number;
  totalCost: number;
  minMarginPct: number;
  /** Share of cost backed by evidence, 0..1. Softens the wording when it's low. */
  evidencedPct?: number;
}): MarginVerdict {
  const revenue = Number(input.revenue) || 0;
  const cost = Number(input.totalCost) || 0;
  const floor = Math.min(100, Math.max(0, Number(input.minMarginPct) || 0)) / 100;
  const quiet = revenue <= 0 || floor <= 0;
  if (quiet) return { below: false, losing: revenue > 0 && cost > revenue, quiet: true, message: null };

  const margin = (revenue - cost) / revenue;
  const losing = margin < 0;
  const below = margin < floor;
  if (!below) return { below: false, losing: false, quiet: false, message: null };

  const marginText = `${Math.round(margin * 100)}%`;
  const floorText = `${Math.round(floor * 100)}%`;
  // Soft-pedal when most of the cost is guesswork: telling someone they're
  // losing money on numbers they estimated is how a real warning gets ignored.
  const shaky = (input.evidencedPct ?? 1) < 0.5;
  const hedge = shaky ? ' Most of this job’s cost is estimated, so check the figures before you act on it.' : '';

  return {
    below: true,
    losing,
    quiet: false,
    message: losing
      ? `This job is running at a loss (${marginText}).${hedge}`
      : `Margin is ${marginText}, below your ${floorText} floor.${hedge}`,
  };
}
