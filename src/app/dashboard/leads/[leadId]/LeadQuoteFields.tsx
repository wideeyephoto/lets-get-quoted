'use client';

import { useEffect, useState } from 'react';
import type { QuoteItem } from '@/lib/jobs';
import QuoteBuilder from '../../jobs/[id]/QuoteBuilder';
import { QUOTE_ITEMS_EVENT, quoteShape, type QuoteItemsDetail } from './quote-shape';

// Wraps the shared QuoteBuilder for the lead "Send the quote" form. The builder
// runs in live mode (no Save button); we mirror its items into hidden inputs so
// the surrounding <form action={convertLead}> carries them on submit, and keep
// quotedAmount in lockstep with the total so the ≥$1 check still holds.
export default function LeadQuoteFields({ initialItems }: { initialItems: QuoteItem[] }) {
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const total = quoteShape(items).total;

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
