'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import type { QuoteItem } from '@/lib/jobs';

const FREQ_LABEL: Record<string, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
const FREQ_WORD: Record<string, string> = { weekly: 'week', biweekly: '2 weeks', monthly: 'month' };

function money(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Record a plan the client agreed to away from their quote page.
//
// The start date is the whole point of this card. Both signup paths used to
// begin the plan the moment the button was pressed, so a monthly plan agreed on
// the 29th silently billed on the 29th forever — a date nobody chose.
export default function AcceptPlanCard({
  item,
  action,
  today,
}: {
  item: QuoteItem;
  action: (formData: FormData) => void | Promise<void>;
  today: string;
}) {
  const [mode, setMode] = useState<'cycle' | 'prepay'>('cycle');
  const [autoCharge, setAutoCharge] = useState(false);

  const term = item.termCycles && item.termCycles > 0 ? item.termCycles : 0;
  const discount = item.prepayDiscountPercent ?? 0;
  const freq = item.frequency ?? 'monthly';
  const prepaidTotal = term > 0 ? Math.round(item.amount * term * (1 - discount / 100) * 100) / 100 : 0;

  return (
    <form action={action} className="accept-plan-card">
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="mode" value={mode} />

      <div className="accept-plan-head">
        <strong>{item.label}</strong>
        <span>
          {money(item.amount)}{FREQ_LABEL[freq]}
          {term > 0 ? ` · ${term} payment${term === 1 ? '' : 's'}` : ' · ongoing'}
        </span>
      </div>

      <label className="accept-plan-field">
        <span>First visit</span>
        {/* min=today: a back-dated first visit generates visits that are already
            overdue, and with auto-charge on, charges that are already late. */}
        <input type="date" name="startDate" defaultValue={today} min={today} required />
        <small>Every {FREQ_WORD[freq]} from this day{term > 0 ? `, for ${term} visit${term === 1 ? '' : 's'}` : ''}.</small>
      </label>

      {term > 0 ? (
        <div className="accept-plan-modes" role="radiogroup" aria-label="How they're paying">
          <button type="button" role="radio" aria-checked={mode === 'cycle'} className={mode === 'cycle' ? 'on' : ''} onClick={() => setMode('cycle')}>
            <strong>{money(item.amount)} each visit</strong>
            <small>Billed on the plan&apos;s cadence.</small>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'prepay'} className={mode === 'prepay' ? 'on' : ''} onClick={() => setMode('prepay')}>
            <strong>{money(prepaidTotal)} up front</strong>
            <small>{discount > 0 ? `Whole term, ${discount}% off.` : 'Whole term in one payment.'}</small>
          </button>
        </div>
      ) : null}

      {/* Only meaningful per-cycle: prepay is one lump sum, so a per-visit charge
          on top would bill the same work twice. The server enforces this too. */}
      {mode === 'cycle' ? (
        <label className="accept-plan-toggle">
          <input type="checkbox" name="autoCharge" checked={autoCharge} onChange={(event) => setAutoCharge(event.target.checked)} />
          <span>
            <strong>They agreed to automatic charges</strong>
            <small>
              {autoCharge
                ? 'They still have to enter the card themselves — you can text them the link from the plan page.'
                : 'Leave off if you haven’t agreed to keep a card on file. You can still invoice each visit.'}
            </small>
          </span>
        </label>
      ) : null}

      <SaveButton className="btn primary" pendingLabel="Setting up…">Client accepted this plan</SaveButton>
    </form>
  );
}
