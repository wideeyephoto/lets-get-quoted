'use client';

import SaveButton from '@/components/save-button';
import { useRadioGroup } from '@/components/use-radio-group';
import { useQuoteDeck } from './QuoteDeck';

/**
 * Two ways to pay, presented as two ways to pay.
 *
 * A PLAN IS AN OFFER, NOT A REQUIREMENT. The contractor's payment terms are
 * mutually exclusive on their side, so quoting on "Payment Plan" removed paying
 * in full — for the homeowner, not just for the contractor. Somebody who would
 * happily have settled the whole thing was shown a deposit, four dated
 * installments and a card authorization, with no way to say "I'll just pay it".
 *
 * Both routes are named here, with their real terms, at the moment the choice
 * is actually made. Choosing one reveals what it involves; neither is
 * pre-selected, because a default here is a thumb on the scale.
 */

export type Installment = { seq: number; label: string; amount: string };

export default function PayChoice({
  planId,
  totalLabel,
  depositLabel,
  installments,
  installmentLabel,
  allowPayInFull,
  payInFullInFlight,
  awaitingApproval,
  authorized,
  businessName,
  payInFullAction,
  authorizeAction,
  depositHref,
  secureNote,
}: {
  planId: string;
  /** The whole thing, in one payment. */
  totalLabel: string;
  depositLabel: string;
  installments: Installment[];
  /** "4 payments of $437.50, monthly" — the terms in one line. */
  installmentLabel: string;
  allowPayInFull: boolean;
  payInFullInFlight: boolean;
  awaitingApproval: boolean;
  authorized: boolean;
  businessName: string;
  payInFullAction: (formData: FormData) => void;
  authorizeAction: (formData: FormData) => void;
  depositHref: string | null;
  secureNote: React.ReactNode;
}) {
  const { payMode, setPayMode } = useQuoteDeck();

  // The markup below has claimed to be a radio group since it was written, and
  // until now nothing handled a key press: a screen reader announced "radio, 1
  // of 2", the arrow key that implies did nothing, and Tab walked through both
  // options instead of into the group. See useRadioGroup for the contract.
  const { getOptionProps } = useRadioGroup({
    options: ['full', 'plan'] as const,
    value: payMode,
    onChange: setPayMode,
  });

  // A full payment already at checkout means the choice has been made and
  // re-offering it would start a second one.
  if (payInFullInFlight) {
    return <p className="client-plan-fineprint">A full payment is being processed…</p>;
  }

  // Nothing to choose between: the contractor offers the plan only.
  const showChoice = allowPayInFull;

  return (
    <div className="pay-choice">
      {showChoice ? (
        <>
          <p className="pay-choice-label">Choose how you&rsquo;d like to pay</p>
          <div className="pay-choice-grid" role="radiogroup" aria-label="How you would like to pay">
            <button
              type="button"
              {...getOptionProps('full')}
              className={`pay-option${payMode === 'full' ? ' is-chosen' : ''}`}
            >
              <span className="pay-option-head">
                <strong>Pay in full</strong>
                <span className="pay-option-tick" aria-hidden="true">{payMode === 'full' ? '✓' : ''}</span>
              </span>
              <span className="pay-option-amount">{totalLabel}</span>
              <small>One payment and you&rsquo;re done. Nothing is scheduled and no card is saved for later.</small>
            </button>

            <button
              type="button"
              {...getOptionProps('plan')}
              className={`pay-option${payMode === 'plan' ? ' is-chosen' : ''}`}
            >
              <span className="pay-option-head">
                <strong>Pay over time</strong>
                <span className="pay-option-tick" aria-hidden="true">{payMode === 'plan' ? '✓' : ''}</span>
              </span>
              <span className="pay-option-amount">{depositLabel} today</span>
              <small>then {installmentLabel}. 0% interest, no fees — this splits the same total, nothing more.</small>
            </button>
          </div>
        </>
      ) : null}

      {/* The installment schedule, dated and summed. Shown whenever "pay over
          time" is the live route — which is always, when it is the only one. */}
      {!showChoice || payMode === 'plan' ? (
        <div className="pay-choice-detail">
          <div className="client-plan-schedule">
            <div className="client-plan-row">
              <span>Deposit (today)</span>
              <strong>{depositLabel}</strong>
            </div>
            {installments.map((entry) => (
              <div className="client-plan-row" key={entry.seq}>
                <span>Installment {entry.seq} · {entry.label}</span>
                <strong>{entry.amount}</strong>
              </div>
            ))}
            {/* The sum, stated. The copy above claims this splits the total and
                nothing more, and a claim about arithmetic should be checkable
                without doing the arithmetic. */}
            <div className="client-plan-row client-plan-sum">
              <span>Total</span>
              <strong>{totalLabel}</strong>
            </div>
          </div>

          {awaitingApproval ? (
            /* TWO AGREEMENTS, IN ORDER. Authorizing a card schedule is not
               accepting a quote, and this form used to be the first thing on
               the page — asked for before the work, the prices or the total had
               been shown once. It waits its turn now. */
            <p className="client-plan-later">
              This is how the total would be split. You&rsquo;ll set it up — and authorize the card — after you approve the
              quote. Nothing is charged before then.
            </p>
          ) : authorized ? (
            depositHref ? (
              <>
                <a href={depositHref} className="btn primary client-plan-cta">Pay {depositLabel} deposit</a>
                {secureNote}
              </>
            ) : null
          ) : (
            <form action={authorizeAction} className="client-plan-authorize">
              <input type="hidden" name="planId" value={planId} />
              <label htmlFor="plan-signer">Type your full name to authorize automatic installment payments</label>
              <input id="plan-signer" name="signerName" type="text" placeholder="Your full name" autoComplete="name" required />
              <p className="client-plan-fineprint">
                By typing your name you authorize {businessName} to charge your saved card for each installment shown above
                on its due date. You can pay the remaining balance in full at any time with no penalty. This is separate
                from your approval of the quote.
              </p>
              <SaveButton pendingLabel="Starting…">Authorize &amp; pay {depositLabel} deposit</SaveButton>
              {secureNote}
            </form>
          )}
        </div>
      ) : null}

      {payMode === 'full' ? (
        <div className="pay-choice-detail">
          <form action={payInFullAction} className="client-plan-payoff">
            <input type="hidden" name="planId" value={planId} />
            <p className="client-plan-fineprint">
              One payment of {totalLabel} to {businessName}. No installments are scheduled and no card is saved.
            </p>
            <SaveButton pendingLabel="Starting…">Pay {totalLabel} now</SaveButton>
            {secureNote}
          </form>
        </div>
      ) : null}
    </div>
  );
}
