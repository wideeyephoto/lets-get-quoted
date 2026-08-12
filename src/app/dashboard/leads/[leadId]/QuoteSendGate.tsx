'use client';

import { useEffect, useState } from 'react';
import SaveButton from '@/components/save-button';
import styles from '../leads.module.css';
import { QUOTE_ITEMS_EVENT, type QuoteItemsDetail } from './quote-shape';

/**
 * A $0 QUOTE COULD BE SENT.
 *
 * "Send quote" was live with a blank line-item description, a blank price and a
 * $0.00 total, with "send this client their quote" ticked. The server did
 * refuse it — but only after the press, as a red sentence next to a button
 * somebody had already committed to, on a form they had been filling in for
 * five minutes. A rule you can only discover by breaking it is a rule the
 * interface never taught.
 *
 * So the button states the rule while it is still worth knowing, and the row
 * above it says what is about to happen: who it goes to and for how much. Those
 * two facts were nowhere on the screen at the moment of sending — the recipient
 * was in a card further up and the total was inside the builder — and they are
 * exactly the two a person wants confirmed before a quote leaves their hands.
 *
 * THE VALIDATION IS STILL THE SERVER'S. This disables a button; it does not
 * decide anything. convertLeadAction re-checks every one of these conditions,
 * because a form that has been made harder to submit incorrectly is not a form
 * that cannot be.
 */
/* The event name and the shape it carries live in ./quote-shape, which has no
   'use client' directive — the lead page is a server component and seeds this
   gate by calling quoteShape, and a plain function imported out of a client
   module by a server one arrives as a client reference rather than a function. */
export default function QuoteSendGate({
  stripeConnected,
  recipient,
  initial,
}: {
  stripeConnected: boolean;
  /** "a text to 248-555-0117" / "an email to dana@…" / null when nothing sends. */
  recipient: string | null;
  initial: QuoteItemsDetail;
}) {
  const [detail, setDetail] = useState<QuoteItemsDetail>(initial);

  // A window event rather than lifted state or a context: the builder is inside
  // one <details> and this button is at the foot of another, several hundred
  // lines of server-rendered markup apart. Threading a provider between them
  // would make two server components client components to carry one number.
  useEffect(() => {
    const onItems = (event: Event) => setDetail((event as CustomEvent<QuoteItemsDetail>).detail);
    window.addEventListener(QUOTE_ITEMS_EVENT, onItems);
    return () => window.removeEventListener(QUOTE_ITEMS_EVENT, onItems);
  }, []);

  const hasQuote = detail.billable > 0 || detail.subscriptions > 0;
  const money = detail.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const why = !stripeConnected
    ? null
    : !hasQuote
      ? 'Add a line item with a description and a price — a quote for $0.00 can’t be sent.'
      : null;

  return (
    <>
      {/* WHAT IS ABOUT TO HAPPEN, in one line, next to the button that does it. */}
      {stripeConnected && hasQuote ? (
        <p className={styles.sendQuoteConfirm}>
          Sending <strong>{money}</strong>
          {detail.subscriptions > 0 ? <> plus {detail.subscriptions} recurring plan{detail.subscriptions === 1 ? '' : 's'}</> : null}
          {recipient ? <> as {recipient}</> : <> — nothing goes out automatically; you&rsquo;ll get a link to send</>}.
        </p>
      ) : null}

      <div className={styles.sendQuoteActions}>
        {/* Disabled rather than swapped for a link. The link navigated away,
            which threw the half-built quote out — and the button moving
            position between states made the form re-flow the moment Stripe
            connected. */}
        <SaveButton disabled={!stripeConnected || !hasQuote}>
          {!stripeConnected ? '🔒 Connect Stripe to send' : 'Send quote'}
        </SaveButton>
      </div>
      {why ? <p className={styles.sendQuoteHint}>{why}</p> : null}
    </>
  );
}
