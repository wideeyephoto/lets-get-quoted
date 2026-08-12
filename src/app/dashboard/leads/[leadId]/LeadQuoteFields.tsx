'use client';

import { useEffect, useState } from 'react';
import type { QuoteItem } from '@/lib/jobs';
import QuoteBuilder from '../../jobs/[id]/QuoteBuilder';
import { QUOTE_ITEMS_EVENT, type QuoteItemsDetail } from './QuoteSendGate';

// base rows + pre-checked add-ons count toward the one-off total; unchecked
// add-ons and subscriptions (recurring, billed separately) don't (mirrors
// computeQuoteTotal on the server).
function liveTotal(items: QuoteItem[]): number {
  return items.reduce((sum, item) => (item.kind === 'subscription' ? sum : item.kind === 'base' || item.selected ? sum + (Number(item.amount) || 0) : sum), 0);
}

/**
 * What counts as a quote at all.
 *
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

// Wraps the shared QuoteBuilder for the lead "Send the quote" form. The builder
// runs in live mode (no Save button); we mirror its items into hidden inputs so
// the surrounding <form action={convertLead}> carries them on submit, and keep
// quotedAmount in lockstep with the total so the ≥$1 check still holds.
export default function LeadQuoteFields({ initialItems }: { initialItems: QuoteItem[] }) {
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const total = liveTotal(items);

  // Announced rather than lifted: the send button lives at the foot of a
  // different <details>, hundreds of lines of server-rendered markup away, and
  // threading a provider between them would turn two server components into
  // client components to carry one number. See QuoteSendGate.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<QuoteItemsDetail>(QUOTE_ITEMS_EVENT, { detail: quoteShape(items) }));
  }, [items]);

  return (
    <>
      <input type="hidden" id="quoteItems" name="quoteItems" value={JSON.stringify(items)} />
      <input type="hidden" id="quotedAmount" name="quotedAmount" value={total > 0 ? total : ''} />
      <QuoteBuilder initialItems={initialItems} onItemsChange={setItems} />
    </>
  );
}
