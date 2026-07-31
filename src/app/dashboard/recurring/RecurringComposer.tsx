'use client';

import { useRef, useState } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import ClientLookup, { type LookupClient } from '@/components/client-lookup';
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

type ServiceOption = { id: string; name: string; unitPrice: number };

export default function RecurringComposer({
  today,
  services = [],
  clients = [],
}: {
  today: string;
  services?: ServiceOption[];
  clients?: LookupClient[];
}) {
  const [autoCharge, setAutoCharge] = useState(false);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  // Picking an existing customer fills what we already know about them. It only
  // ever writes into a field the owner hasn't typed in — overwriting an address
  // somebody just entered because the name matched an old record would lose the
  // thing they came here to set.
  function fillFromClient(client: LookupClient | null) {
    if (!client) return;
    const fill = (ref: typeof phoneRef, value: string | null) => {
      if (ref.current && value && !ref.current.value.trim()) {
        ref.current.value = value;
        ref.current.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    fill(phoneRef, client.phone);
    fill(emailRef, client.email);
    fill(addressRef, client.address);
  }

  // Picking a saved service fills the plan name + price (both uncontrolled
  // inputs live in the same form), so owners don't retype what they already saved.
  function prefillFromService(event: React.ChangeEvent<HTMLSelectElement>) {
    const service = services.find((item) => item.id === event.target.value);
    const form = event.currentTarget.form;
    if (service && form) {
      const titleInput = form.elements.namedItem('title') as HTMLInputElement | null;
      const amountInput = form.elements.namedItem('amount') as HTMLInputElement | null;
      if (titleInput) titleInput.value = service.name;
      if (amountInput) amountInput.value = String(service.unitPrice);
    }
    event.currentTarget.value = '';
  }

  // Money field: keep it to cents. step="0.01" only validates on submit, so it
  // doesn't stop someone typing 450.2266565 — strip non-numerics and cap the
  // decimals at 2 as they type.
  function limitCents(event: React.FormEvent<HTMLInputElement>) {
    const el = event.currentTarget;
    let v = el.value.replace(/[^\d.]/g, '');
    const dot = v.indexOf('.');
    if (dot !== -1) {
      v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    }
    if (v !== el.value) el.value = v;
  }

  return (
    <details className="recurring-composer job-feed-composer">
      <summary className="btn primary">+ New recurring plan</summary>
      <form action={createRecurringPlanAction} className="recurring-form job-feed-composer-form">
        {services.length > 0 ? (
          <div className="field">
            <label htmlFor="rp-fromservice">Start from a saved service (optional)</label>
            <select id="rp-fromservice" defaultValue="" onChange={prefillFromService} aria-label="Fill from your price book">
              <option value="">Pick from price book…</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.unitPrice > 0 ? ` — $${Math.round(service.unitPrice).toLocaleString('en-US')}` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
              <span aria-hidden="true">$</span>
              <input id="rp-amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" autoComplete="off" onInput={limitCents} />
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
            <ClientLookup
              id="rp-client"
              name="clientName"
              clients={clients}
              required
              placeholder="Jordan Reyes"
              onPick={fillFromClient}
            />
          </div>
          <div className="field">
            <label htmlFor="rp-phone">Phone</label>
            <input id="rp-phone" ref={phoneRef} name="clientPhone" type="tel" placeholder="(555) 123-4567" />
          </div>
          <div className="field">
            <label htmlFor="rp-email">Email</label>
            <input id="rp-email" ref={emailRef} name="clientEmail" type="email" placeholder="jordan@email.com" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="rp-address">Service address (optional)</label>
          <AddressAutocomplete id="rp-address" name="address" inputRef={addressRef} placeholder="123 Oak St" />
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
