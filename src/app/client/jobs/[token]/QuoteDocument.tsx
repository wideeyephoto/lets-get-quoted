'use client';

import SignatureMark from '@/components/signature-mark';
import { formatUsdExact as formatUsd } from '@/lib/money-format';
import type { SignatureMethod } from '@/lib/signature';
import type { QuoteItem } from '@/lib/jobs';
import { QUOTE_FORM_ID, useQuoteDeck } from './QuoteDeck';

const FREQ_SUFFIX: Record<'weekly' | 'biweekly' | 'monthly', string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };

// type="button" matters: this used to sit inside the approval form, where a bare
// button submits it. It no longer does — the form is the rail — but printing a
// quote must never approve it, and that is not a fact worth re-learning.
function PrintButton() {
  return (
    <button type="button" className="linklike quote-doc-print" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}

// Term + pay-in-full line under a subscription.
function subCaption(item: QuoteItem): string {
  const parts: string[] = [];
  const term = item.termCycles ?? 0;
  const discount = item.prepayDiscountPercent ?? 0;
  if (term > 0) parts.push(`${term} payments`);
  if (term > 0 && discount > 0) {
    const full = item.amount * term * (1 - discount / 100);
    parts.push(`or ${formatUsd(full)} up front — save ${discount}%`);
  }
  return parts.join(' · ');
}

/**
 * The quote as a document: what the work is, what is included, what can be
 * added, and what it comes to.
 *
 * IT NO LONGER CARRIES THE FORM. The signature and the Approve button moved to
 * the rail beside the total (QuoteAcceptance), so the thing somebody presses is
 * next to the number they are agreeing to rather than a screen below the last
 * line item. The add-on checkboxes stay here, where the add-ons are, and reach
 * the form by `form={QUOTE_FORM_ID}` — the same submission, the same field
 * name, the same server action.
 */
export default function QuoteDocument({
  items,
  insurance = null,
  header,
  signature = null,
  closedNote = null,
}: {
  items: QuoteItem[];
  /**
   * Present once the quote has been accepted. The mark, the name and the day —
   * on the document, so the printed copy is the executed one.
   */
  signature?: { name: string | null; at: string | null; path: string | null; method: SignatureMethod | null } | null;
  /**
   * What the quote is FOR. A page of prices with no job attached is a bill, not
   * a quote — the reference, the address and the scope have to be on the
   * document being signed, not scattered up the page above it.
   */
  header?: { ref: string; address: string | null; scope: string | null };
  /**
   * The contractor's certificate, already vetted for whether it may be shown —
   * null covers "none uploaded", "switched off" and "expired" alike, and this
   * component is deliberately not in a position to tell them apart or to
   * second-guess the answer. See lib/insurance-client.
   */
  insurance?: { summary: string; url: string | null; filename: string | null } | null;
  /**
   * Why the extras can no longer be changed, in the customer's terms — or null
   * when they still can be, or when there is nothing to say. Shown WITH the
   * add-ons rather than only in the rail, because the rail is not where
   * somebody is when they press a button that does not respond.
   */
  closedNote?: string | null;
}) {
  const { addons, selected, setAddon, awaitingApproval, canEditOptions, optionsOpen } = useQuoteDeck();
  const baseItems = items.filter((item) => item.kind === 'base');
  const subscriptionItems = items.filter((item) => item.kind === 'subscription');

  return (
    <div className="quote-document">
      {header ? (
        <div className="quote-doc-head">
          <div className="quote-doc-head-row">
            <span className="quote-doc-ref">Quote {header.ref}</span>
            {/* Print, which is also Save as PDF on every platform that matters.
                Somebody comparing two contractors wants this on paper, and
                "no invoices have been shared yet" is not an answer to that. */}
            <PrintButton />
          </div>
          {header.address ? <p className="quote-doc-where">{header.address}</p> : null}
          {header.scope ? <p className="quote-doc-scope">{header.scope}</p> : null}
        </div>
      ) : null}

      {baseItems.length > 0 ? (
        <div className="quote-doc-group">
          <p className="quote-doc-group-label">Included in your quote</p>
          <ul className="quote-doc-list">
            {baseItems.map((item) => (
              <li className="quote-doc-line" key={item.id}>
                <span className="quote-doc-line-label">{item.label}</span>
                <span className="quote-doc-line-amount">{formatUsd(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {addons.length > 0 ? (
        <div className="quote-doc-group">
          <p className="quote-doc-group-label">Optional add-ons</p>
          {/* Said once, plainly, above the first one. An upsell that does not
              state it is optional is read as a line somebody has already been
              committed to. */}
          <p className="quote-doc-group-note">
            {awaitingApproval
              ? 'Yours to take or leave. Your total updates as you choose.'
              : optionsOpen
                ? 'Changed your mind? Tick or untick, then confirm in the summary.'
                : 'What you chose when you approved this quote.'}
          </p>
          <ul className="quote-doc-list quote-doc-addons">
            {addons.map((item) => {
              const isOn = Boolean(selected[item.id]);
              const name = (
                <>
                  <span className="quote-doc-addon-name">
                    {item.label}
                    {item.recommended ? <span className="quote-doc-badge">★ Recommended</span> : null}
                  </span>
                  <span className="quote-doc-addon-price">+{formatUsd(item.amount)}</span>
                </>
              );

              /* LOCKED IS A DIFFERENT THING, NOT A GREYER VERSION OF THE SAME
                 THING. Once the window has closed these rows were still a
                 <label> wrapping a disabled checkbox: the card kept its pointer
                 cursor, its hover lift and a pill reading "+ Add", and pressing
                 it did nothing whatsoever. A control that looks live and
                 answers to nothing is worse than no control — the customer
                 concludes the page is broken, which is the one thing a quote
                 must never look like.

                 So the checkbox goes entirely (a disabled input is still an
                 input a screen reader announces), the <label> becomes a plain
                 row, and the pill stops pretending: it states what was chosen
                 rather than offering to change it. */
              if (!canEditOptions) {
                return (
                  <li className={`quote-doc-addon is-locked${isOn ? ' is-selected' : ''}`} key={item.id}>
                    <div className="quote-doc-addon-hit">
                      {name}
                      <span className="quote-doc-addon-btn">{isOn ? 'Included' : 'Not added'}</span>
                    </div>
                  </li>
                );
              }

              return (
                <li className={`quote-doc-addon${isOn ? ' is-selected' : ''}`} key={item.id}>
                  <label className="quote-doc-addon-hit">
                    <input
                      className="quote-doc-addon-input"
                      type="checkbox"
                      name="addon"
                      value={item.id}
                      /* The form owner, which is in the rail. This is what lets
                         the button that submits sit beside the total it
                         submits. */
                      form={QUOTE_FORM_ID}
                      checked={isOn}
                      onChange={(event) => setAddon(item.id, event.target.checked)}
                    />
                    {name}
                    <span className="quote-doc-addon-btn" aria-hidden="true">{isOn ? '✓ Added' : '+ Add'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {/* The reason, where the buttons used to be. */}
          {!canEditOptions && closedNote ? <p className="quote-doc-addons-closed">{closedNote}</p> : null}
        </div>
      ) : null}

      {subscriptionItems.length > 0 ? (
        <div className="quote-doc-group">
          <p className="quote-doc-group-label">Ongoing plans</p>
          <ul className="quote-doc-list">
            {subscriptionItems.map((item) => (
              <li className="quote-doc-line" key={item.id}>
                <span className="quote-doc-line-label">{item.label}{subCaption(item) ? <small className="quote-doc-subline">{subCaption(item)}</small> : null}</span>
                <span className="quote-doc-line-amount">{formatUsd(item.amount)}{FREQ_SUFFIX[item.frequency ?? 'monthly']}</span>
              </li>
            ))}
          </ul>
          <p className="quote-doc-sub-note">Billed separately on approval — you&rsquo;ll set up a card for these.</p>
        </div>
      ) : null}

      {/* The total is stated here as well as in the rail, because the rail is
          not on the paper and is not on a phone until you reach the bottom.
          Same number, same source. */}
      <div className="quote-doc-total">
        <span>Your total{subscriptionItems.length > 0 ? ' today' : ''}</span>
        <strong><DocTotal /></strong>
      </div>

      {/* Below the total, not above it.
          This is reassurance, and reassurance belongs where somebody looks when
          they hesitate — putting it above the price makes the quote lead with
          an argument nobody asked for yet. */}
      {insurance ? (
        <div className="quote-doc-insured">
          <span className="quote-doc-insured-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <span className="quote-doc-insured-copy">
            <strong>Insured</strong>
            <small>{insurance.summary}</small>
          </span>
          {insurance.url ? (
            /* Opens the certificate itself. The claim is only worth anything
               because it can be checked, so the link is the feature. */
            <a
              className="quote-doc-insured-link"
              href={insurance.url}
              target="_blank"
              rel="noreferrer"
              download={insurance.filename ?? undefined}
            >
              View certificate
            </a>
          ) : null}
        </div>
      ) : null}

      {/* THE EXECUTION BLOCK, ON THE DOCUMENT ITSELF.
          The mark was collected in the rail, and the rail is a screen control
          that does not print. A signed quote whose printed copy shows no
          signature is not a signed quote — this is the part somebody files, and
          it is deliberately the last thing on the page, where a proposal has
          always put it. */}
      {signature?.name ? (
        <div className="quote-doc-executed">
          <p className="quote-doc-group-label">Accepted</p>
          <div className="quote-doc-executed-row">
            <span className="quote-doc-executed-mark">
              <SignatureMark path={signature.path} name={signature.name} method={signature.method} />
              <span className="quote-doc-executed-rule" aria-hidden="true" />
              <small>{signature.name}</small>
            </span>
            {signature.at ? (
              <span className="quote-doc-executed-when">
                <strong>{signature.at}</strong>
                <span className="quote-doc-executed-rule" aria-hidden="true" />
                <small>Date accepted</small>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocTotal() {
  const { total, shownTotal } = useQuoteDeck();
  const atRest = Math.abs(shownTotal - total) < 0.005;
  return <>{atRest ? formatUsd(total) : formatUsd(Math.round(shownTotal))}</>;
}
