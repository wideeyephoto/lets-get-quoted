'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { CloseOnSuccess } from '@/components/modal-dialog';
import type { Recurrence } from '@/lib/cash-forecast';
import type { ScheduledPayment } from '@/lib/cash-forecast-data';
import { saveScheduledPaymentAction } from './actions';

// The add/edit form for a bill or scheduled payment.
//
// Lives in its own file because it is now rendered from two places — inline in
// the list below, and in the "Add expense" popup at the top of the page. One
// definition on purpose: these fields carry validation rules that have to match
// the server's, and two copies would drift into two different ideas of what a
// scheduled payment is.

export const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: 'bill', label: 'Bill / overhead' },
  { id: 'materials', label: 'Materials' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'loan', label: 'Loan / finance' },
  { id: 'tax', label: 'Tax' },
  { id: 'other', label: 'Other' },
];

export const RECURRENCE_OPTIONS: { id: Recurrence; label: string }[] = [
  { id: 'once', label: 'One time' },
  { id: 'weekly', label: 'Every week' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Every month' },
];

export const RECURRENCE_WORD: Record<Recurrence, string> = {
  once: 'One time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

export function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? 'Bill';
}

export type ScheduledPaymentDraft = { label: string; category: string; recurrence: Recurrence };

export default function ScheduledPaymentForm({
  row,
  draft,
  todayKey,
  onCancel,
  inModal = false,
}: {
  row?: ScheduledPayment;
  draft?: ScheduledPaymentDraft;
  todayKey: string;
  onCancel?: () => void;
  /** Rendered inside the popup — close it once the save lands. */
  inModal?: boolean;
}) {
  const [recurrence, setRecurrence] = useState<Recurrence>(row?.recurrence ?? draft?.recurrence ?? 'monthly');
  // Tracked so the inbound tick can explain itself. It is one checkbox away
  // from the "this amount is certain" one, and getting it wrong turns a bill
  // into income — which reads as a healthier month rather than as a mistake.
  const [incoming, setIncoming] = useState(row?.direction === 'in');

  return (
    <form action={saveScheduledPaymentAction} className="cash-bill-form">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      {/* The two forms ask identical questions, so without this the only way to
          tell "changing the truck payment" from "adding a second truck payment"
          is to remember which button you pressed. */}
      <p className="cash-bill-form-head">
        {row ? <>Editing <strong>{row.label}</strong></> : <>New scheduled payment</>}
      </p>
      <div className="cash-bill-form-grid">
        <label className="cash-bill-field wide">
          <span>What is it</span>
          <input name="label" defaultValue={row?.label ?? draft?.label ?? ''} placeholder="General liability insurance" required />
        </label>
        <label className="cash-bill-field">
          <span>Amount</span>
          <input name="amount" type="number" min="0.01" step="0.01" defaultValue={row?.amount ?? ''} placeholder="450.00" required />
        </label>
        <label className="cash-bill-field">
          <span>Type</span>
          <select name="category" defaultValue={row?.category ?? draft?.category ?? 'bill'}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="cash-bill-field">
          <span>{recurrence === 'once' ? 'Due' : 'First one due'}</span>
          <input name="dueDate" type="date" defaultValue={row?.dueDate ?? todayKey} required />
        </label>
        <label className="cash-bill-field">
          <span>How often</span>
          <select name="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {recurrence !== 'once' ? (
          <label className="cash-bill-field">
            <span>Stops after (optional)</span>
            <input name="endsOn" type="date" defaultValue={row?.endsOn ?? ''} />
          </label>
        ) : null}
        <label className="cash-bill-field wide">
          <span>Note (optional)</span>
          <input name="note" defaultValue={row?.note ?? ''} placeholder="Account #, who to call, anything you'd forget" />
        </label>
      </div>

      <label className="cash-bill-check">
        <input type="checkbox" name="confirmed" defaultChecked={row?.confirmed ?? false} />
        <span>
          <strong>This amount is certain</strong>
          <small>Tick when it&rsquo;s a fixed figure on a fixed date. Left off, it&rsquo;s treated as an estimate and drops out of the confirmed-only line.</small>
        </span>
      </label>

      <label className={`cash-bill-check${incoming ? ' is-flipped' : ''}`}>
        <input
          type="checkbox"
          name="direction"
          value="in"
          checked={incoming}
          onChange={(event) => setIncoming(event.target.checked)}
        />
        <span>
          <strong>This is money coming IN</strong>
          <small>
            {incoming
              ? 'This will ADD to your balance every time it lands, not take away from it. Right for a financing draw or an equipment sale — wrong for anything you pay.'
              : 'A financing draw, an equipment sale, money you’re putting in yourself — anything the system can’t see as a customer payment.'}
          </small>
        </span>
      </label>

      <div className="cash-bill-form-actions">
        <SaveButton className="btn primary" pendingLabel="Saving…">{row ? 'Save changes' : 'Add it'}</SaveButton>
        {onCancel ? <button type="button" className="linklike" onClick={onCancel}>Cancel</button> : null}
        {inModal ? <CloseOnSuccess /> : null}
      </div>
    </form>
  );
}
