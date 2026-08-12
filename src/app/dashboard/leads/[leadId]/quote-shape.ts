import type { QuoteItem } from '@/lib/jobs';

/**
 * WHAT COUNTS AS A QUOTE AT ALL — on both sides of the client boundary.
 *
 * This lived in LeadQuoteFields.tsx, which is a `'use client'` module. The
 * lead page is a server component and calls quoteShape to seed the send gate
 * with its opening state, and a plain function imported out of a client module
 * by a server one does not arrive as a function: it arrives as a client
 * reference, and calling it throws "quoteShape is not a function".
 *
 * So it lives here, in a module with no directive, and both sides import it.
 * The rule this file encodes is unchanged.
 */

/** The bridge between the builder and the send gate — see QuoteSendGate. */
export const QUOTE_ITEMS_EVENT = 'lgq-quote-items';

export type QuoteItemsDetail = {
  /** Lines with BOTH a description and a price. Half a quote is not a quote. */
  billable: number;
  /** Named recurring plans, which are a real quote with nothing due today. */
  subscriptions: number;
  /** The one-off total, as the server will compute it. */
  total: number;
};

/**
 * base rows + pre-checked add-ons count toward the one-off total; unchecked
 * add-ons and subscriptions (recurring, billed separately) don't. Mirrors
 * computeQuoteTotal on the server.
 */
function liveTotal(items: QuoteItem[]): number {
  return items.reduce(
    (sum, item) => (item.kind === 'subscription' ? sum : item.kind === 'base' || item.selected ? sum + (Number(item.amount) || 0) : sum),
    0,
  );
}

/**
 * A NAME AND A PRICE, not either. A line called "Fence repair" with no amount
 * and a line with $400 and no description are both half a quote, and the form
 * would send either — see QuoteSendGate for what that looked like from the
 * contractor's side.
 */
export function quoteShape(items: QuoteItem[]): QuoteItemsDetail {
  const subscriptions = items.filter((item) => item.kind === 'subscription' && item.label.trim().length > 0).length;
  const billable = items.filter(
    (item) => item.kind !== 'subscription' && item.label.trim().length > 0 && (Number(item.amount) || 0) > 0,
  ).length;
  return { billable, subscriptions, total: liveTotal(items) };
}
