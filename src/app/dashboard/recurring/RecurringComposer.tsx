'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { createRecurringPlanAction } from './actions';

// Inlined (not imported from @/lib/recurring) so this client component doesn't
// pull the server-only recurring module — and its Stripe/admin deps — into the
// browser bundle. Keep in sync with FREQUENCY_OPTIONS there.
const FREQUENCY_OPTIONS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
] as const;

export default function RecurringComposer({ today }: { today: string }) {
  const [autoCharge, setAutoCharge] = useState(false);

  return (
    <details className="recurring-composer job-feed-composer">
      <summary className="btn primary">+ New recurring plan</summary>
      <form action={createRecurringPlanAction} className="recurring-form job-feed-composer-form">
        <div className="field">
          <label htmlFor="rp-title">Plan name</label>
          <input id="rp-title" name="title" type="text" required maxLength={80} placeholder="Weekly lawn mowing" />
        </div>

        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="rp-frequency">Repeats</label>
            <select id="rp-frequency" name="frequency" defaultValue="weekly">
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-first">First visit</label>
            <input id="rp-first" name="firstVisitDate" type="date" required min={today} defaultValue={today} />
          </div>
          <div className="field">
            <label htmlFor="rp-amount">Price per visit</label>
            <div className="currency-input">
              <input id="rp-amount" name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="rp-scope">What&apos;s included (optional)</label>
          <textarea id="rp-scope" name="scope" rows={2} placeholder="Mow, edge, blow. Copied onto each visit." />
        </div>

        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="rp-client">Customer name</label>
            <input id="rp-client" name="clientName" type="text" required placeholder="Jordan Reyes" />
          </div>
          <div className="field">
            <label htmlFor="rp-phone">Phone</label>
            <input id="rp-phone" name="clientPhone" type="tel" placeholder="(555) 123-4567" />
          </div>
          <div className="field">
            <label htmlFor="rp-email">Email</label>
            <input id="rp-email" name="clientEmail" type="email" placeholder="jordan@email.com" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="rp-address">Service address (optional)</label>
          <input id="rp-address" name="address" type="text" placeholder="123 Oak St" />
        </div>

        <label className="recurring-autocharge">
          <input type="checkbox" name="autoCharge" checked={autoCharge} onChange={(event) => setAutoCharge(event.target.checked)} />
          <span>
            <strong>Auto-charge a saved card each visit</strong>
            <span className="field-note">
              {autoCharge
                ? 'We’ll text/email the customer a secure Stripe link to save their card — no charge until each visit. You can also resend the link anytime from the plan.'
                : 'Leave off to just auto-create the scheduled job each cycle and collect payment yourself.'}
            </span>
          </span>
        </label>

        <div className="recurring-form-actions">
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">Create plan</SaveButton>
        </div>
      </form>
    </details>
  );
}
