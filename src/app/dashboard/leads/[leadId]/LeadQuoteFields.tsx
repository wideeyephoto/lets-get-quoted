'use client';

import { useState } from 'react';
import type { QuoteItem } from '@/lib/jobs';
import QuoteBuilder from '../../jobs/[id]/QuoteBuilder';

// base rows + pre-checked add-ons count toward the one-off total; unchecked
// add-ons and subscriptions (recurring, billed separately) don't (mirrors
// computeQuoteTotal on the server).
function liveTotal(items: QuoteItem[]): number {
  return items.reduce((sum, item) => (item.kind === 'subscription' ? sum : item.kind === 'base' || item.selected ? sum + (Number(item.amount) || 0) : sum), 0);
}

// Wraps the shared QuoteBuilder for the lead "Send the quote" form. The builder
// runs in live mode (no Save button); we mirror its items into hidden inputs so
// the surrounding <form action={convertLead}> carries them on submit, and keep
// quotedAmount in lockstep with the total so the ≥$1 check still holds.
export default function LeadQuoteFields({ initialItems }: { initialItems: QuoteItem[] }) {
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const total = liveTotal(items);
  return (
    <>
      <input type="hidden" id="quoteItems" name="quoteItems" value={JSON.stringify(items)} />
      <input type="hidden" id="quotedAmount" name="quotedAmount" value={total > 0 ? total : ''} />
      <QuoteBuilder initialItems={initialItems} onItemsChange={setItems} />
    </>
  );
}
