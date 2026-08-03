// A last read of a quote before it goes out.
//
// The split is the whole design, and it's the same one the quote drafter uses:
// a model is good at noticing that a demolition line is missing from a kitchen
// rebuild, and bad at deciding what demolition costs. So arithmetic and history
// are computed here, in code, and the model is only ever allowed to say a thing
// is ABSENT. It never returns a number.
//
// Every finding carries where it came from. A contractor deciding whether to act
// on "disposal is missing" should know whether that's arithmetic, their own past
// jobs, or a model's opinion — those deserve different amounts of trust.

import { lineMargin, marginVerdict } from '@/lib/cost-truth';

export type FindingSource = 'math' | 'history' | 'ai';
export type FindingSeverity = 'high' | 'medium' | 'low';

export type QuoteFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  source: FindingSource;
};

export type GuardLine = {
  id: string;
  label: string;
  amount: number;
  kind: 'base' | 'addon' | 'subscription';
  selected: boolean;
  /** Matched price-book entry, when the label resolved to one. */
  unitCost?: number | null;
  unit?: string | null;
};

export type GuardInput = {
  lines: GuardLine[];
  /** What the customer said they wanted. Empty is itself worth flagging. */
  scope: string;
  estimatedHours: number | null;
  /** Loaded cost of an hour of crew time — wage plus burden. */
  loadedHourlyRate: number;
  minMarginPct: number;
  /** Past jobs' quote labels, for the "you usually also include…" check. */
  history: { labels: string[] }[];
};

const HOURS_TOLERANCE = 0.25;
/** Below this many past jobs, "you usually also include X" is not a pattern. */
export const COMPANION_MIN_JOBS = 4;
/** How often a companion has to show up before it's worth mentioning. */
export const COMPANION_MIN_RATE = 0.6;

export function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Lines that actually make up the price: the base, plus any selected add-on. */
export function billableLines(lines: GuardLine[]): GuardLine[] {
  return lines.filter((line) => line.kind !== 'subscription' && (line.kind === 'base' || line.selected));
}

export function quoteTotal(lines: GuardLine[]): number {
  return Math.round(billableLines(lines).reduce((sum, line) => sum + (Number(line.amount) || 0), 0) * 100) / 100;
}

/**
 * What this quote is expected to cost to deliver, and how much of that is a
 * real figure rather than a blank.
 *
 * Lines with no price-book cost contribute NOTHING to the estimate and are
 * counted separately. Treating them as free would produce a margin that looks
 * excellent precisely because the contractor hasn't costed their book yet.
 */
export function estimatedCost(input: GuardInput): { cost: number; costedLines: number; uncostedLines: number } {
  let cost = 0;
  let costedLines = 0;
  let uncostedLines = 0;
  for (const line of billableLines(input.lines)) {
    const unitCost = line.unitCost;
    if (unitCost === null || unitCost === undefined) {
      uncostedLines += 1;
      continue;
    }
    cost += Number(unitCost) || 0;
    costedLines += 1;
  }
  // Labour the contractor estimated but hasn't priced into the book still costs
  // money, so it belongs in the estimate when we have an hours figure.
  if (input.estimatedHours && input.loadedHourlyRate > 0) {
    cost += input.estimatedHours * input.loadedHourlyRate;
  }
  return { cost: Math.round(cost * 100) / 100, costedLines, uncostedLines };
}

/**
 * Services that usually travel with the ones on this quote.
 *
 * Deliberately quiet on a thin history: with three past jobs, "you always
 * include disposal" means "you did it twice", which is not a pattern and turns
 * the whole panel into noise the first week somebody uses it.
 */
export function companionSuggestions(
  currentLabels: string[],
  history: { labels: string[] }[],
  options?: { minJobs?: number; minRate?: number },
): { label: string; withCount: number; relatedJobs: number; rate: number }[] {
  const minJobs = options?.minJobs ?? COMPANION_MIN_JOBS;
  const minRate = options?.minRate ?? COMPANION_MIN_RATE;
  const current = new Set(currentLabels.map(normalizeLabel).filter(Boolean));
  if (current.size === 0) return [];

  // Only past jobs that share something with this one are evidence about it.
  const related = history.filter((job) => job.labels.some((label) => current.has(normalizeLabel(label))));
  if (related.length < minJobs) return [];

  const counts = new Map<string, { label: string; count: number }>();
  for (const job of related) {
    // Dedupe within a job: a quote listing "Disposal" twice is still one job.
    const seen = new Set<string>();
    for (const raw of job.labels) {
      const key = normalizeLabel(raw);
      if (!key || current.has(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { label: raw, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .map((entry) => ({ label: entry.label, withCount: entry.count, relatedJobs: related.length, rate: entry.count / related.length }))
    .filter((entry) => entry.rate >= minRate)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);
}

/**
 * Everything that can be established without asking a model. Runs first, and
 * runs even when the AI half is unavailable — a quote with no API key still gets
 * its arithmetic checked.
 */
export function deterministicFindings(input: GuardInput): QuoteFinding[] {
  const findings: QuoteFinding[] = [];
  const billable = billableLines(input.lines);
  const total = quoteTotal(input.lines);

  if (billable.length === 0) {
    findings.push({
      id: 'empty',
      severity: 'high',
      title: 'There is nothing on this quote',
      detail: 'No base line and no selected add-ons, so the customer would receive a quote for $0.',
      source: 'math',
    });
    return findings;
  }

  const free = billable.filter((line) => !(Number(line.amount) > 0));
  if (free.length > 0) {
    findings.push({
      id: 'zero-lines',
      severity: 'high',
      title: `${free.length} line${free.length === 1 ? '' : 's'} priced at $0`,
      detail: `${free.map((line) => `“${line.label}”`).join(', ')} — either price ${free.length === 1 ? 'it' : 'them'} or take ${free.length === 1 ? 'it' : 'them'} off, because a customer reads a $0 line as work included for nothing.`,
      source: 'math',
    });
  }

  // Money. The model is never consulted about any of this.
  const { cost, uncostedLines } = estimatedCost(input);
  const verdict = marginVerdict({ revenue: total, totalCost: cost, minMarginPct: input.minMarginPct });
  if (verdict.message) {
    findings.push({
      id: 'margin',
      severity: verdict.losing ? 'high' : 'medium',
      title: verdict.losing ? 'This quote loses money' : 'Margin is under your floor',
      detail: `${verdict.message} Priced at ${money(total)} against an estimated ${money(cost)} to deliver.`,
      source: 'math',
    });
  }

  if (uncostedLines > 0) {
    findings.push({
      id: 'uncosted',
      severity: 'low',
      title: `${uncostedLines} line${uncostedLines === 1 ? ' has' : 's have'} no cost in your price book`,
      detail:
        uncostedLines === billable.length
          ? 'Nothing here has a cost against it, so the margin above is guesswork. Adding costs to your price book is what makes this check mean anything.'
          : 'The margin above only counts the lines that do, so the real figure is lower than it looks.',
      source: 'math',
    });
  }

  // Hours. Only checkable when the contractor gave an estimate AND the quote has
  // hourly lines — otherwise there's nothing to compare and silence is correct.
  const hourLines = billable.filter((line) => line.unit === 'hour');
  if (input.estimatedHours && input.estimatedHours > 0 && hourLines.length > 0 && input.loadedHourlyRate > 0) {
    const quotedHours = hourLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0) / input.loadedHourlyRate;
    const drift = Math.abs(quotedHours - input.estimatedHours) / input.estimatedHours;
    if (drift > HOURS_TOLERANCE) {
      const under = quotedHours < input.estimatedHours;
      findings.push({
        id: 'hours',
        severity: 'medium',
        title: under ? 'The quote covers fewer hours than you estimated' : 'The quote covers more hours than you estimated',
        detail: `You estimated ${input.estimatedHours} hours; the hourly lines here come to about ${quotedHours.toFixed(1)}. One of the two is out of date.`,
        source: 'math',
      });
    }
  }

  for (const companion of companionSuggestions(billable.map((line) => line.label), input.history)) {
    findings.push({
      id: `companion:${normalizeLabel(companion.label)}`,
      severity: 'medium',
      title: `You usually include “${companion.label}”`,
      detail: `${companion.withCount} of your last ${companion.relatedJobs} similar jobs had it on the quote. This one doesn't.`,
      source: 'history',
    });
  }

  if (!input.scope.trim()) {
    findings.push({
      id: 'no-scope',
      severity: 'low',
      title: 'No job description to check against',
      detail: 'Nothing was written down about what the customer asked for, so nothing here can tell you whether the quote covers it.',
      source: 'math',
    });
  }

  return findings;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * One list, worst first, with the model's findings after the arithmetic at equal
 * severity — a number that is definitely wrong outranks a suspicion.
 */
export function mergeFindings(deterministic: QuoteFinding[], ai: QuoteFinding[]): QuoteFinding[] {
  const seen = new Set(deterministic.map((finding) => finding.id));
  const merged = [...deterministic, ...ai.filter((finding) => !seen.has(finding.id))];
  return merged.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (a.source === 'ai' ? 1 : 0) - (b.source === 'ai' ? 1 : 0);
  });
}

/** The one-line verdict above the list. Says nothing rather than inventing praise. */
export function guardSummary(findings: QuoteFinding[]): { tone: 'clear' | 'check' | 'stop'; message: string } {
  const high = findings.filter((f) => f.severity === 'high').length;
  if (high > 0) {
    return { tone: 'stop', message: `${high} thing${high === 1 ? '' : 's'} worth fixing before this goes out.` };
  }
  if (findings.length === 0) {
    return { tone: 'clear', message: 'Nothing stood out. That is not the same as correct — it is what could be checked.' };
  }
  return { tone: 'check', message: `${findings.length} thing${findings.length === 1 ? '' : 's'} to look at.` };
}

export { lineMargin };
