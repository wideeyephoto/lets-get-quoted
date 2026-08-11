'use client';

import SaveButton from '@/components/save-button';
import SignaturePad from '@/components/signature-pad';
import SignatureMark from '@/components/signature-mark';
import { formatUsdExact as formatUsd } from '@/lib/money-format';
import type { SignatureMethod } from '@/lib/signature';
import { LiveTotal, QUOTE_FORM_ID, useQuoteDeck } from './QuoteDeck';

/**
 * The decision, beside the number it is about.
 *
 * Everything a person needs in order to say yes, in one place that stays on
 * screen while they read the rest: what it comes to, what they added, when they
 * would start, how they intend to pay, and the box their name goes in. The
 * Approve button used to be at the bottom of the itemised list, which meant the
 * total scrolled away from the button that agreed to it.
 *
 * This is also the approval <form>. The add-on checkboxes live in the document
 * in the main column and reach it through `form={QUOTE_FORM_ID}`, so the same
 * FormData arrives at the same server action with the same field names — the
 * page moved, the submission did not.
 */

export type PaymentSummary = {
  /** What "pay in full" costs, when the contractor offers it. */
  full: string | null;
  /** "$1,750.00 today, then 4 × $437.50", when there is a plan. */
  plan: string | null;
  /** What happens when they have not chosen, or there is nothing to choose. */
  fallback: string;
};

export default function QuoteAcceptance({
  approveAction,
  businessName,
  scheduleOffered,
  scheduledLabel,
  payment,
  /**
   * What the payment plan was set up to cover. A quote whose add-ons have moved
   * the total away from this is not a plan that covers the total, and saying so
   * is the difference between an honest page and the one that showed a $3,500
   * quote beside installments adding to $3,502.
   */
  planTotal,
}: {
  approveAction: (formData: FormData) => void;
  businessName: string;
  scheduleOffered: boolean;
  scheduledLabel: string | null;
  payment: PaymentSummary;
  planTotal: number | null;
}) {
  const {
    signer,
    setSigner,
    signerValid,
    signMethod,
    setSignMethod,
    signaturePath,
    setSignaturePath,
    canApprove,
    addons,
    selected,
    addonCount,
    addonsTotal,
    baseTotal,
    total,
    preferredDate,
    payMode,
  } = useQuoteDeck();

  const chosen = addons.filter((addon) => selected[addon.id]);
  const dateLine = preferredDate ?? scheduledLabel ?? (scheduleOffered ? 'Choose one below' : null);
  const payLine =
    payMode === 'full' ? payment.full ?? payment.fallback : payMode === 'plan' ? payment.plan ?? payment.fallback : payment.fallback;
  // Compared in cents, because this is a claim about arithmetic.
  const planCovers = planTotal != null && Math.round(planTotal * 100) !== Math.round(total * 100) ? planTotal : null;

  return (
    <div className="quote-rail-card">
      <p className="quote-rail-eyebrow">Your total</p>
      <p className="quote-rail-total">
        <LiveTotal className="quote-rail-amount" live />
      </p>

      <ul className="quote-rail-lines">
        <li>
          <span>Included in the quote</span>
          <span>{formatUsd(baseTotal)}</span>
        </li>
        {addons.length > 0 ? (
          <li className={addonCount > 0 ? 'is-on' : undefined}>
            <span>
              {addonCount === 0
                ? 'No add-ons selected'
                : `${addonCount} add-on${addonCount === 1 ? '' : 's'}`}
              {chosen.length > 0 ? (
                <small className="quote-rail-addon-names">
                  {chosen.slice(0, 3).map((addon) => addon.label).join(', ')}
                  {chosen.length > 3 ? ` +${chosen.length - 3} more` : ''}
                </small>
              ) : null}
            </span>
            <span>{addonCount === 0 ? '—' : `+${formatUsd(addonsTotal)}`}</span>
          </li>
        ) : null}
      </ul>

      <dl className="quote-rail-facts">
        {dateLine ? (
          <div>
            <dt>Preferred start</dt>
            <dd>{dateLine}</dd>
          </div>
        ) : null}
        <div>
          <dt>How you&rsquo;ll pay</dt>
          <dd>{payLine}</dd>
        </div>
      </dl>

      {planCovers != null ? (
        <p className="quote-rail-mismatch" role="status">
          Your payment plan was set up to cover {formatUsd(planCovers)}. Approving with your current selections comes to{' '}
          {formatUsd(total)} — {businessName} will confirm how the difference is billed before anything is charged.
        </p>
      ) : null}

      {/* THE SIGNATURE THAT BELONGS TO THIS AGREEMENT.
          A typed name was already being collected on this page — under
          "authorize automatic installment payments", which accepts a card
          schedule and says nothing about the work or the price. Accepting the
          quote is the other agreement, and it had no signature at all. Two
          agreements, two signatures, in the order they are made. */}
      <form action={approveAction} id={QUOTE_FORM_ID} className="quote-rail-form quote-doc-sign">
        <label htmlFor="quote-signer">Your name</label>
        <input
          id="quote-signer"
          name="signerName"
          type="text"
          placeholder="Your full name"
          autoComplete="name"
          required
          value={signer}
          onChange={(event) => setSigner(event.target.value)}
          aria-describedby="quote-signer-hint"
        />
        {!signerValid ? (
          <p id="quote-signer-hint" className="quote-rail-hint">
            Enter your first and last name.
          </p>
        ) : null}

        {/* DRAWING IS THE DEFAULT, AND TYPING IS NOT A FALLBACK.
            A canvas cannot be operated from a keyboard, and no amount of ARIA
            makes one that can — so the alternative has to be a real, equal
            control that is announced and reachable, not something hidden behind
            a "having trouble?" link. Both are signatures under E-SIGN; the
            record stores which one was made rather than flattening them. */}
        <fieldset className="sign-method">
          <legend>How would you like to sign?</legend>
          <div className="sign-method-tabs" role="radiogroup" aria-label="How would you like to sign?">
            <button
              type="button"
              role="radio"
              aria-checked={signMethod === 'drawn'}
              className={`sign-method-tab${signMethod === 'drawn' ? ' is-chosen' : ''}`}
              onClick={() => setSignMethod('drawn')}
            >
              Draw my signature
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={signMethod === 'typed'}
              className={`sign-method-tab${signMethod === 'typed' ? ' is-chosen' : ''}`}
              onClick={() => setSignMethod('typed')}
            >
              Type my name
            </button>
          </div>
        </fieldset>

        {signMethod === 'drawn' ? (
          <>
            <SignaturePad onChange={setSignaturePath} label="Sign here" hint="Use your finger, a stylus, or your mouse." />
            {/* The mark itself. Only ever set from the pad, and cleaned again
                on the server before it can reach a column. */}
            <input type="hidden" name="signaturePath" value={signaturePath ?? ''} />
          </>
        ) : (
          <div className="sign-typed">
            <SignatureMark path={null} name={signer.trim() || null} method="typed" />
            <p className="quote-rail-hint">Your typed name is your signature.</p>
          </div>
        )}

        <SaveButton
          className="btn primary quote-rail-approve"
          disabled={!canApprove}
          pendingLabel="Approving…"
          savedLabel="Approved ✓"
        >
          <ApproveLabel />
        </SaveButton>

        {!canApprove && signerValid && signMethod === 'drawn' ? (
          <p className="quote-rail-hint" role="status">
            Sign in the box above to approve.
          </p>
        ) : null}

        <p className="quote-doc-fineprint">
          Accepting confirms the work and the price above{businessName ? `, with ${businessName}` : ''}. It is not a payment
          and no card is charged — anything owed is asked for separately, after this.
        </p>
      </form>
    </div>
  );
}

/** "Approve · $3,500.00" — the button names the number it commits to. */
function ApproveLabel() {
  const { total } = useQuoteDeck();
  return <>Approve quote · {formatUsd(total)}</>;
}

/**
 * The rail after the answer is yes.
 *
 * Not a banner saying "approved" — a receipt. What was agreed, for how much,
 * with which options, starting when, and the one thing that happens next. This
 * is the thing somebody screenshots and the thing they come back to the link
 * for six weeks later.
 */
export function QuoteApproved({
  total,
  addons,
  scheduledLabel,
  signerName,
  signedAt,
  signaturePath,
  signatureMethod,
  nextStep,
  nextHref,
  nextLabel,
}: {
  total: string;
  addons: string[];
  scheduledLabel: string | null;
  signerName: string | null;
  signedAt: string | null;
  signaturePath: string | null;
  signatureMethod: SignatureMethod | null;
  nextStep: string;
  nextHref: string | null;
  nextLabel: string | null;
}) {
  return (
    <div className="quote-rail-card is-approved">
      <p className="quote-rail-eyebrow">
        <span className="quote-rail-tick" aria-hidden="true">✓</span> Approved
      </p>
      <p className="quote-rail-total">
        <span className="quote-rail-amount">{total}</span>
      </p>

      {addons.length > 0 ? (
        <ul className="quote-rail-lines">
          {addons.map((label) => (
            <li key={label}>
              <span>{label}</span>
              <span aria-hidden="true">✓</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="quote-rail-facts">
        {scheduledLabel ? (
          <div>
            <dt>Start date</dt>
            <dd>{scheduledLabel}</dd>
          </div>
        ) : null}
        {signerName ? (
          <div>
            <dt>Accepted by</dt>
            <dd>
              {/* Their own mark, where a line of text used to say their name.
                  A drawn signature IS the readback — the name under it is the
                  caption, not the evidence. */}
              {signatureMethod === 'drawn' && signaturePath ? (
                <SignatureMark path={signaturePath} name={signerName} method="drawn" className="is-receipt" />
              ) : null}
              {signerName}
              {signedAt ? <small> · {signedAt}</small> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="quote-rail-next">{nextStep}</p>
      {nextHref && nextLabel ? (
        <a className="btn primary quote-rail-approve" href={nextHref}>
          {nextLabel}
        </a>
      ) : null}
    </div>
  );
}
