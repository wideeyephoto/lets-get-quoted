'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
// Type-only: importing a VALUE from lib/recurring drags the whole server module
// into this client bundle — and it reaches @/lib/invoices -> the PDF builder ->
// node's `fs`, which fails the browser build outright. The cadence options are
// three strings; duplicating them is far cheaper than that dependency.
import type { RecurringPlan } from '@/lib/recurring';

const FREQUENCY_OPTIONS: { id: RecurringPlan['frequency']; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly (every 3 months)' },
  { id: 'semi-annual', label: 'Semi-annual (every 6 months)' },
  { id: 'annual', label: 'Annual (yearly)' },
];

// Change a live plan's price, cadence, or next visit date.
//
// Collapsed by default: this is a page you mostly read, and a form sitting open
// on every plan turns a list of six into a wall.
export default function EditPlanPanel({
  plan,
  action,
  today,
}: {
  plan: RecurringPlan;
  action: (formData: FormData) => void | Promise<void>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(plan.amount));
  const [frequency, setFrequency] = useState(plan.frequency);
  const [nextRunDate, setNextRunDate] = useState(plan.next_run_date);

  const nextAmount = Number(amount);
  // Mirrors requiresReconsent on the server, which is the authority — this only
  // decides whether to ASK. A card on file is permission to take an agreed
  // figure, not whatever the plan later says.
  const isIncrease = plan.auto_charge && Number.isFinite(nextAmount) && nextAmount > plan.amount + 0.005;
  // Anything that moves the schedule rebuilds the plan's future visits, which
  // discards crew and notes on them. Worth saying before they press save.
  const scheduleMoves = frequency !== plan.frequency || nextRunDate !== plan.next_run_date;

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Change plan
      </button>
    );
  }

  return (
    <form action={action} className="plan-edit">
      <div className="plan-edit-grid">
        <label>
          <span>Price each visit</span>
          <input type="number" name="amount" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label>
          <span>Billed</span>
          <select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringPlan['frequency'])}>
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Next visit</span>
          <input type="date" name="nextRunDate" min={today} value={nextRunDate} onChange={(event) => setNextRunDate(event.target.value)} required />
        </label>
      </div>

      {plan.remaining_cycles != null && frequency !== plan.frequency ? (
        <p className="plan-edit-warn">
          This plan has {plan.remaining_cycles} visit{plan.remaining_cycles === 1 ? '' : 's'} left. Changing the cadence keeps
          that count, so the plan will now finish on a different date than agreed.
        </p>
      ) : null}

      {scheduleMoves ? (
        <p className="plan-edit-note">
          The plan&apos;s upcoming visits will be rebuilt on the new schedule. Anything you&apos;d set on those visits — crew,
          notes, a moved date — is lost. Visits already done aren&apos;t touched.
        </p>
      ) : null}

      {isIncrease ? (
        <label className="plan-edit-confirm">
          <input type="checkbox" name="confirmIncrease" required />
          <span>
            <strong>{plan.client_name} agreed to the new price</strong>
            <small>
              This plan charges a card on file{plan.card_last4 ? ` (•••• ${plan.card_last4})` : ''}. The next charge will take
              the higher amount, so they need to have agreed to it first.
            </small>
          </span>
        </label>
      ) : null}

      <div className="plan-edit-actions">
        <SaveButton className="btn primary" pendingLabel="Saving…">Save changes</SaveButton>
        <button type="button" className="linklike" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
