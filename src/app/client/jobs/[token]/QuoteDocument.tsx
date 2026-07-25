'use client';

import { useMemo, useState } from 'react';
import SaveButton from '@/components/save-button';
import type { QuoteItem } from '@/lib/jobs';

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Client-facing itemized quote. Base items are shown as included; optional
// add-ons are checkboxes that update the running total live. Submitting posts
// the accepted add-on ids to the approval action, which locks in the total.
export default function QuoteDocument({
  items,
  approveAction,
}: {
  items: QuoteItem[];
  approveAction: (formData: FormData) => void;
}) {
  const baseItems = items.filter((item) => item.kind === 'base');
  const addonItems = items.filter((item) => item.kind === 'addon');

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addonItems.map((item) => [item.id, item.selected])),
  );

  const baseTotal = useMemo(() => baseItems.reduce((sum, item) => sum + item.amount, 0), [baseItems]);
  const addonsTotal = addonItems.reduce((sum, item) => (selected[item.id] ? sum + item.amount : sum), 0);
  const total = baseTotal + addonsTotal;

  return (
    <form action={approveAction} className="quote-document">
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

      {addonItems.length > 0 ? (
        <div className="quote-doc-group">
          <p className="quote-doc-group-label">Optional add-ons</p>
          <ul className="quote-doc-list">
            {addonItems.map((item) => (
              <li className={`quote-doc-line quote-doc-addon${selected[item.id] ? ' is-selected' : ''}`} key={item.id}>
                <label className="quote-doc-addon-label">
                  <input
                    type="checkbox"
                    name="addon"
                    value={item.id}
                    checked={Boolean(selected[item.id])}
                    onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
                  />
                  <span className="quote-doc-line-label">{item.label}</span>
                </label>
                <span className="quote-doc-line-amount">+{formatUsd(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="quote-doc-total">
        <span>Your total</span>
        <strong>{formatUsd(total)}</strong>
      </div>

      <SaveButton pendingLabel="Approving..." savedLabel="Approved ✓">Approve quote</SaveButton>
    </form>
  );
}
