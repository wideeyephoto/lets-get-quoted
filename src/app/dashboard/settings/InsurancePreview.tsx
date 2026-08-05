'use client';

import ModalDialog from '@/components/modal-dialog';

/**
 * What the homeowner actually sees.
 *
 * "Show it on quotes" is a checkbox whose effect is on a page the contractor
 * never opens — their own quotes go out to other people. This is the only way
 * to check the answer without sending yourself a test quote.
 *
 * It reuses `.quote-doc-insured`, the real block's real class, rather than a
 * lookalike: a preview drawn from its own styles is a preview that drifts, and
 * the day it drifts is the day it stops being worth opening.
 */
export default function InsurancePreview({
  summary,
  withheldReason,
}: {
  /** The exact line a homeowner reads. Null when nothing would be shown. */
  summary: string | null;
  /** Why it is absent, when it is — so the preview explains itself. */
  withheldReason: string | null;
}) {
  return (
    <ModalDialog triggerLabel="Preview on a quote" triggerClassName="btn secondary" title="What your customer sees">
      <div className="insprev">
        {withheldReason ? (
          <p className="insprev-note is-warn">{withheldReason}</p>
        ) : (
          <p className="insprev-note">This is the bottom of every quote you send.</p>
        )}

        <div className="insprev-doc" aria-hidden="true">
          <p className="insprev-group">Included in your quote</p>
          <ul className="insprev-lines">
            <li><span>Water heater replacement</span><span>$1,450.00</span></li>
            <li><span>Haul away &amp; disposal</span><span>$120.00</span></li>
          </ul>
          <div className="insprev-total">
            <span>Your total</span>
            <strong>$1,570.00</strong>
          </div>
          <span className="insprev-approve">Approve quote</span>

          {summary ? (
            /* The real block, in the real place — below the total and the
               button, where somebody looks when they hesitate. */
            <div className="quote-doc-insured">
              <span className="quote-doc-insured-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span className="quote-doc-insured-copy">
                <strong>Insured</strong>
                <small>{summary}</small>
              </span>
              <span className="quote-doc-insured-link">View certificate</span>
            </div>
          ) : (
            <p className="insprev-absent">Nothing about insurance appears here.</p>
          )}
        </div>

        {summary ? (
          <p className="cash-bill-note">
            Tapping <strong>View certificate</strong> opens the document itself, on a link that works for an hour.
            Your policy number is never printed here.
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
