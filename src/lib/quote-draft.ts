import type { QuoteItem, QuoteItemKind } from '@/lib/jobs';

// AI quote drafting — the rules, with no model and no database in sight.
//
// The whole value of this feature is that it prices from the contractor's OWN
// price book. A model that invents plausible numbers is not a quoting tool, it
// is a way to underbid a job by 30% and find out three weeks later. So the
// model's job is to decide WHAT the work is and which of the owner's services
// it maps to; the PRICE comes from the book wherever a match exists, and
// anything the model priced itself is labelled as such and pushed in front of
// the owner to check.
//
// Everything here is pure so those rules are testable without spending a token.

export type DraftSource =
  /** Priced from the owner's price book. The number is theirs, not the model's. */
  | 'price-book'
  /** Derived from what this business has actually charged before. */
  | 'history'
  /** The model's own estimate. Always surfaced for review. */
  | 'estimate';

export type QuoteDraftLine = {
  label: string;
  amount: number;
  kind: QuoteItemKind;
  source: DraftSource;
  /** The price-book service this line was matched to, once resolved. */
  serviceId: string | null;
  serviceName: string | null;
  /** Units of that service (hours, sqft, or a count of flat-rate jobs). */
  quantity: number | null;
  unit: string | null;
  /** One short line for the owner: what to check, or where the price came from. */
  note: string | null;
};

export type PriceBookEntry = {
  id: string;
  name: string;
  unitPrice: number;
  unit: string;
  description?: string | null;
};

/** Units that bill per unit rather than flat. Quantity is meaningful for these. */
const PER_UNIT = new Set(['hour', 'sqft']);

export const MAX_DRAFT_LINES = 14;
export const MAX_LINE_AMOUNT = 500_000;

export const QUICK_QUOTE_REFINE_CHIPS = [
  'Add demo & cleanup',
  'Itemize materials & labor',
  'Add 10% safety margin',
  'Include permits & inspection',
  'Break out into base + add-on',
] as const;

// -- What the model is allowed to send back -----------------------------------

export type RawDraftLine = {
  label?: unknown;
  amount?: unknown;
  kind?: unknown;
  service?: unknown;
  quantity?: unknown;
  note?: unknown;
  priced_from?: unknown;
};

export type RawDraft = {
  lines?: unknown;
  summary?: unknown;
  assumptions?: unknown;
  /** The model's own flag that it lacked the detail to quote responsibly. */
  needs_more_info?: unknown;
  questions?: unknown;
};

export type QuoteDraft = {
  lines: QuoteDraftLine[];
  /** One sentence describing what was quoted, for the owner — never the client. */
  summary: string | null;
  /** What the model had to assume. The reason an owner should read before sending. */
  assumptions: string[];
  /** Set when the scope was too thin to price; lines will be empty. */
  needsMoreInfo: boolean;
  questions: string[];
  /** Counts by provenance, so the UI can lead with "3 of 5 lines need a price check". */
  counts: Record<DraftSource, number>;
};

function toText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function toAmount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_LINE_AMOUNT, Math.round(parsed * 100) / 100);
}

function toKind(value: unknown): QuoteItemKind {
  // Subscriptions are deliberately NOT draftable: signing somebody up to a
  // recurring charge is a decision with a payment method behind it, and it
  // should be a person's deliberate act rather than a suggestion they accepted
  // by not reading carefully.
  return value === 'addon' ? 'addon' : 'base';
}

// -- Matching a drafted line to the owner's price book ------------------------

/** Lowercase, strip punctuation and collapse spacing, for comparing names. */
export function normalizeServiceName(value: string): string {
  return value
    .toLowerCase()
    .replace(new RegExp('[^a-z0-9]+', 'g'), ' ')
    .trim();
}

/**
 * Find the price-book service a drafted line refers to.
 *
 * Exact (normalized) name first, then a containment check in either direction —
 * a model that returns "Drain cleaning" for a service called "Drain cleaning
 * (main line)" is right, and refusing that match would throw away the one thing
 * that makes this feature trustworthy.
 *
 * Anything looser than that is deliberately NOT matched. A fuzzy match that
 * quietly attaches the wrong price is worse than an honest "the model guessed
 * this" flag, because the owner has no way to notice it.
 */
export function matchService(name: string, services: PriceBookEntry[]): PriceBookEntry | null {
  const needle = normalizeServiceName(name);
  if (!needle) return null;

  const exact = services.find((service) => normalizeServiceName(service.name) === needle);
  if (exact) return exact;

  const contained = services.filter((service) => {
    const hay = normalizeServiceName(service.name);
    return hay.includes(needle) || needle.includes(hay);
  });
  // Ambiguity is not a match: two candidates means we don't know which price
  // the owner meant, and picking one is a coin flip with their money.
  return contained.length === 1 ? contained[0] : null;
}

/**
 * The price for a matched service, given how many units.
 *
 * Flat-rate services (each/job/visit) ignore a fractional quantity — "1.5 water
 * heater installs" is not a thing, and rounding it up silently would inflate
 * the quote. Per-unit services (hour/sqft) multiply, defaulting to 1.
 */
export function priceFromService(service: PriceBookEntry, quantity: number | null): number {
  const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
  if (PER_UNIT.has(service.unit)) return Math.round(service.unitPrice * qty * 100) / 100;
  return Math.round(service.unitPrice * Math.max(1, Math.round(qty)) * 100) / 100;
}

export function isPerUnit(unit: string): boolean {
  return PER_UNIT.has(unit);
}

/**
 * Turn what the model returned into lines an owner can trust.
 *
 * This is the safety boundary. Every line comes out with an explicit provenance,
 * and a price-book match OVERRIDES the model's number rather than averaging with
 * it or preferring whichever is higher — the owner's price is the owner's price.
 */
export function reconcileDraft(raw: RawDraft, services: PriceBookEntry[]): QuoteDraft {
  const rawLines = Array.isArray(raw?.lines) ? (raw.lines as RawDraftLine[]) : [];
  const lines: QuoteDraftLine[] = [];

  for (const entry of rawLines.slice(0, MAX_DRAFT_LINES)) {
    const label = toText(entry?.label, 120);
    if (!label) continue;

    const serviceName = toText(entry?.service, 120);
    const service = serviceName ? matchService(serviceName, services) : null;
    const quantityRaw = Number(entry?.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : null;
    const modelAmount = toAmount(entry?.amount);

    if (service) {
      const amount = priceFromService(service, quantity);
      const qtyNote = isPerUnit(service.unit) && quantity
        ? `${quantity} × ${service.unit} at your rate`
        : 'Your price-book rate';
      lines.push({
        label,
        amount,
        kind: toKind(entry?.kind),
        source: 'price-book',
        serviceId: service.id,
        serviceName: service.name,
        quantity,
        unit: service.unit,
        // Worth saying out loud when the model disagreed with the book: it is
        // usually a sign the scope is bigger or smaller than the standard job.
        note: Math.abs(modelAmount - amount) > Math.max(25, amount * 0.25) && modelAmount > 0
          ? `${qtyNote}. The draft suggested ${formatMoney(modelAmount)} — check the scope matches.`
          : qtyNote,
      });
      continue;
    }

    const fromHistory = entry?.priced_from === 'history';
    lines.push({
      label,
      amount: modelAmount,
      kind: toKind(entry?.kind),
      source: fromHistory ? 'history' : 'estimate',
      serviceId: null,
      serviceName: serviceName || null,
      quantity,
      unit: null,
      note: toText(entry?.note, 160)
        || (fromHistory ? 'Based on what you have charged before — check it still holds.' : 'Not in your price book — check this price before sending.'),
    });
  }

  const counts: Record<DraftSource, number> = { 'price-book': 0, history: 0, estimate: 0 };
  for (const line of lines) counts[line.source] += 1;

  return {
    lines,
    summary: toText(raw?.summary, 240) || null,
    assumptions: Array.isArray(raw?.assumptions)
      ? (raw.assumptions as unknown[]).map((item) => toText(item, 160)).filter(Boolean).slice(0, 6)
      : [],
    needsMoreInfo: raw?.needs_more_info === true || lines.length === 0,
    questions: Array.isArray(raw?.questions)
      ? (raw.questions as unknown[]).map((item) => toText(item, 160)).filter(Boolean).slice(0, 4)
      : [],
    counts,
  };
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// -- What the model is told ---------------------------------------------------

export const MAX_BOOK_LINES = 60;
export const MAX_HISTORY_JOBS = 10;

/**
 * The owner's price book, as the model sees it.
 *
 * Names are given verbatim, because the model is asked to echo one back and an
 * exact echo is what makes the match reliable.
 */
const UNIT_PHRASE: Record<string, string> = {
  hour: 'per hour',
  sqft: 'per square foot',
  each: 'each',
  visit: 'per visit',
  job: 'per job',
};

export function unitPhrase(unit: string): string {
  return UNIT_PHRASE[unit] ?? `per ${unit}`;
}

export function formatPriceBook(services: PriceBookEntry[]): string {
  if (services.length === 0) return '';
  return services
    .slice(0, MAX_BOOK_LINES)
    .map((service) => {
      const note = service.description ? ` — ${service.description.replace(/\s+/g, ' ').trim().slice(0, 80)}` : '';
      return `- "${service.name}": $${service.unitPrice} ${unitPhrase(service.unit)}${note}`;
    })
    .join('\n');
}

export type HistoricalQuote = {
  scope: string | null;
  total: number;
  lines: Array<{ label: string; amount: number }>;
};

/**
 * Comparable work this business has actually quoted.
 *
 * Scope and money only. The client's name, phone, email and address are
 * deliberately NOT here: none of them improve a price, and a third-party model
 * has no business holding a list of who lives where. The same rule is why the
 * job being quoted is sent as its scope text alone.
 */
export function formatQuoteHistory(quotes: HistoricalQuote[]): string {
  const usable = quotes
    .filter((quote) => quote.total > 0 && (quote.scope?.trim() || quote.lines.length > 0))
    .slice(0, MAX_HISTORY_JOBS);
  if (usable.length === 0) return '';

  return usable
    .map((quote) => {
      const scope = (quote.scope ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'no description';
      const lines = quote.lines
        .slice(0, 6)
        .map((line) => `${line.label.replace(/\s+/g, ' ').trim().slice(0, 48)} $${Math.round(line.amount)}`)
        .join('; ');
      return `- "${scope}" → $${Math.round(quote.total)}${lines ? ` (${lines})` : ''}`;
    })
    .join('\n');
}

// -- Into the shape the quote builder already speaks --------------------------

/**
 * Convert drafted lines into real quote items.
 *
 * Add-ons come back UNSELECTED. An optional extra that arrives pre-ticked isn't
 * an option, it's a line the owner has to remember to remove — and the one time
 * they forget, a client is looking at a bigger number than the job needs.
 */
export function draftToQuoteItems(lines: QuoteDraftLine[], idPrefix = 'ai'): QuoteItem[] {
  return lines.map((line, index) => ({
    id: `${idPrefix}-${index + 1}-${normalizeServiceName(line.label).replace(/ /g, '-').slice(0, 24) || 'line'}`,
    label: line.label,
    amount: line.amount,
    kind: line.kind,
    selected: line.kind === 'base',
    recommended: false,
  }));
}

/**
 * A draft as it crosses to the browser.
 *
 * Provenance travels ALONGSIDE the items rather than inside them: a QuoteItem
 * is the thing that gets saved and shown to a client, and where a price came
 * from is between us and the contractor.
 *
 * Lives here rather than in the server action so a client component can import
 * the type without importing the action module.
 */
export type SerializedDraft = {
  items: QuoteItem[];
  provenance: Array<{ source: DraftSource; note: string | null }>;
  summary: string | null;
  assumptions: string[];
  questions: string[];
  needsMoreInfo: boolean;
  confidence: string;
  total: number;
};

/** The running total a draft would produce — base lines only, same as a real quote. */
export function draftTotal(lines: QuoteDraftLine[]): number {
  return Math.round(lines.filter((line) => line.kind === 'base').reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
}

/**
 * The single sentence to lead the review with.
 *
 * Leads with what needs checking, not with what worked — an owner skimming this
 * needs to know whether they can send it, and "3 lines priced from your book"
 * is not the answer to that question.
 */
export function draftConfidenceNote(draft: QuoteDraft): string {
  const { 'price-book': book, history, estimate } = draft.counts;
  const total = book + history + estimate;
  if (total === 0) return 'Nothing could be drafted from this scope.';
  if (estimate === 0 && history === 0) {
    return `All ${total} line${total === 1 ? '' : 's'} priced from your price book.`;
  }
  const unpriced = estimate + history;
  return `${unpriced} of ${total} line${total === 1 ? '' : 's'} ${unpriced === 1 ? 'is' : 'are'} not from your price book — check ${unpriced === 1 ? 'it' : 'them'} before sending.`;
}
