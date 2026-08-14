'use client';

import { useState } from 'react';
import type { LeadQuoteDraft } from '@/lib/leads';
import styles from '../leads.module.css';

type Terms = 'full' | 'deposit' | 'plan';

// A default first-installment date one month out, so the field is pre-filled
// with a sensible value the contractor can adjust.
function defaultFirstDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// "Payment Terms" for the Send-the-quote form. Three mutually exclusive choices:
//   • Pay in full — no deposit (existing behavior).
//   • Deposit + remaining balance — the existing deposit request.
//   • Payment Plan — a deposit now + fixed, 0%-interest installments that split
//     the SAME quote total (never more). convertLeadAction reads `paymentTerms`
//     and the matching fields below.
//
// `draft` reopens it on the terms the last quote was sent with. A deposit
// percentage and an installment schedule are decisions, not typing, but they
// are decisions the owner already made — and until the draft existed, undoing a
// quote silently reset all three back to "pay in full".
export default function DepositField({ draft }: { draft?: LeadQuoteDraft | null }) {
  const [terms, setTerms] = useState<Terms>(draft?.paymentTerms ?? 'full');

  return (
    <div className={styles.depositField}>
      <p className={styles.termsHeading}>Payment terms</p>
      <div className={styles.termsOptions} role="radiogroup" aria-label="Payment terms">
        <label className={`${styles.termsOption}${terms === 'full' ? ' ' + styles.termsOptionOn : ''}`}>
          <input type="radio" name="paymentTerms" value="full" checked={terms === 'full'} onChange={() => setTerms('full')} />
          <span>
            <strong>Pay in full</strong>
            <small>Client pays the whole quote in one payment.</small>
          </span>
        </label>
        <label className={`${styles.termsOption}${terms === 'deposit' ? ' ' + styles.termsOptionOn : ''}`}>
          <input type="radio" name="paymentTerms" value="deposit" checked={terms === 'deposit'} onChange={() => setTerms('deposit')} />
          <span>
            <strong>Deposit + remaining balance</strong>
            <small>Collect a deposit up front; the balance is billed later.</small>
          </span>
        </label>
        <label className={`${styles.termsOption}${terms === 'plan' ? ' ' + styles.termsOptionOn : ''}`}>
          <input type="radio" name="paymentTerms" value="plan" checked={terms === 'plan'} onChange={() => setTerms('plan')} />
          <span>
            <strong>Payment Plan</strong>
            <small>Deposit now, then equal monthly installments. 0% interest, no fees — splits the same total.</small>
          </span>
        </label>
      </div>

      {terms === 'deposit' ? (
        <div className={styles.depositRow}>
          <div className={styles.depositAmount}>
            <input name="depositValue" type="number" min="1" step="1" inputMode="decimal" placeholder="25" aria-label="Deposit amount" defaultValue={draft?.depositValue ?? ''} />
            <select name="depositUnit" aria-label="Deposit unit" defaultValue={draft?.depositUnit ?? 'percent'}>
              <option value="percent">% of quote</option>
              <option value="fixed">$ fixed</option>
            </select>
          </div>
          <select name="depositTiming" aria-label="When the deposit is due" defaultValue={draft?.depositTiming ?? 'before_schedule'}>
            <option value="before_schedule">Due before scheduling</option>
            <option value="before_work">Due before work starts</option>
          </select>
        </div>
      ) : null}

      {terms === 'plan' ? (
        <div className={styles.planFields}>
          <div className={styles.planRow}>
            <label>
              <span>Deposit</span>
              <span className={styles.planInline}>
                <input name="planDepositPercent" type="number" min="1" max="99" step="1" defaultValue={draft?.planDepositPercent ?? 50} aria-label="Deposit percent" />
                <em>% now</em>
              </span>
            </label>
            <label>
              <span>Installments</span>
              <input name="planInstallments" type="number" min="1" max="24" step="1" defaultValue={draft?.planInstallments ?? 4} aria-label="Number of installments" />
            </label>
          </div>
          <div className={styles.planRow}>
            <label>
              <span>Billed</span>
              <select name="planFrequency" defaultValue={draft?.planFrequency ?? 'monthly'} aria-label="Installment frequency">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              <span>First installment</span>
              {/* The stored date only wins while it is still in the future — a
                  draft restored three months after it was sent would otherwise
                  reopen with a first installment already in the past. */}
              <input
                name="planFirstDate"
                type="date"
                defaultValue={draft?.planFirstDate && draft.planFirstDate > new Date().toISOString().slice(0, 10) ? draft.planFirstDate : defaultFirstDate()}
                aria-label="First installment date"
              />
            </label>
          </div>
          {/* THE PLAN AS AN OFFER, NOT A REQUIREMENT.
              These radios are mutually exclusive, so picking Payment Plan used
              to remove paying in full from the CLIENT's page too — somebody who
              would happily have settled the whole thing got a deposit, four
              dated installments and a card authorization, and no way to say
              "I'll just pay it". On by default, because a contractor willing to
              be paid in four parts is rarely unwilling to be paid in one. */}
          <label className={styles.planAllowFull}>
            <input type="checkbox" name="planAllowPayInFull" defaultChecked={draft?.planAllowPayInFull ?? true} />
            <span>
              <strong>Also let them pay in full</strong>
              <small>The client chooses: the whole total in one payment, or the schedule below. Most say yes to one of the two.</small>
            </span>
          </label>
          <p className={styles.planHint}>
            The deposit is collected before scheduling. After it clears, the remaining balance is split into equal
            installments charged automatically to the client&rsquo;s saved card. The client sees every amount and date and
            authorizes the plan before anything is charged.
          </p>
        </div>
      ) : null}
    </div>
  );
}
