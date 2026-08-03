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
  return clampBurden(toFiniteOrNull(accountDefaultPct) ?? 0);
}

export const MAX_BURDEN_PCT = 200;

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
