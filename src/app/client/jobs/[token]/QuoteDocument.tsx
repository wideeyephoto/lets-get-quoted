'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SaveButton from '@/components/save-button';
import type { QuoteItem } from '@/lib/jobs';

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatUsdRounded(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const FREQ_SUFFIX: Record<'weekly' | 'biweekly' | 'monthly', string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };

// Term + pay-in-full line under a subscription.
function subCaption(item: QuoteItem): string {
  const parts: string[] = [];
  const term = item.termCycles ?? 0;
  const discount = item.prepayDiscountPercent ?? 0;
  if (term > 0) parts.push(`${term} payments`);
  if (term > 0 && discount > 0) {
    const full = item.amount * term * (1 - discount / 100);
    parts.push(`or ${formatUsd(full)} up front — save ${discount}%`);
  }
  return parts.join(' · ');
}

// Client-facing itemized quote. Base items are shown as included; optional
// add-ons are Add/Added toggles that update the running total live (with a short
// count-up). Submitting posts the accepted add-on ids to the approval action.
export default function QuoteDocument({
  items,
  approveAction,
}: {
  items: QuoteItem[];
  approveAction: (formData: FormData) => void;
}) {
  const baseItems = items.filter((item) => item.kind === 'base');
  const addonItems = items.filter((item) => item.kind === 'addon');
  const subscriptionItems = items.filter((item) => item.kind === 'subscription');

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addonItems.map((item) => [item.id, item.selected])),
  );

  const baseTotal = useMemo(() => baseItems.reduce((sum, item) => sum + item.amount, 0), [baseItems]);
  const addonsTotal = addonItems.reduce((sum, item) => (selected[item.id] ? sum + item.amount : sum), 0);
  const total = baseTotal + addonsTotal;

  // Count the headline total up/down when the client toggles an add-on. Honors
  // reduced-motion, and settles on the exact (cents-accurate) value at rest.
  const [shownTotal, setShownTotal] = useState(total);
  const shownRef = useRef(total);
  shownRef.current = shownTotal;
  useEffect(() => {
    const from = shownRef.current;
    if (from === total) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShownTotal(total);
      return;
    }
    const start = performance.now();
    const duration = 380;
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShownTotal(from + (total - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  const atRest = Math.abs(shownTotal - total) < 0.5;
  const totalLabel = atRest ? formatUsd(total) : formatUsdRounded(Math.round(shownTotal));

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
          <ul className="quote-doc-list quote-doc-addons">
            {addonItems.map((item) => {
              const isOn = Boolean(selected[item.id]);
              return (
                <li className={`quote-doc-addon${isOn ? ' is-selected' : ''}`} key={item.id}>
                  <label className="quote-doc-addon-hit">
                    <input
                      className="quote-doc-addon-input"
                      type="checkbox"
                      name="addon"
                      value={item.id}
                      checked={isOn}
                      onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
                    />
                    <span className="quote-doc-addon-name">
                      {item.label}
                      {item.recommended ? <span className="quote-doc-badge">★ Recommended</span> : null}
                    </span>
                    <span className="quote-doc-addon-price">+{formatUsd(item.amount)}</span>
                    <span className="quote-doc-addon-btn" aria-hidden="true">{isOn ? '✓ Added' : '+ Add'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {subscriptionItems.length > 0 ? (
        <div className="quote-doc-group">
          <p className="quote-doc-group-label">Ongoing plans</p>
          <ul className="quote-doc-list">
            {subscriptionItems.map((item) => (
              <li className="quote-doc-line" key={item.id}>
                <span className="quote-doc-line-label">{item.label}{subCaption(item) ? <small className="quote-doc-subline">{subCaption(item)}</small> : null}</span>
                <span className="quote-doc-line-amount">{formatUsd(item.amount)}{FREQ_SUFFIX[item.frequency ?? 'monthly']}</span>
              </li>
            ))}
          </ul>
          <p className="quote-doc-sub-note">Billed separately on approval — you’ll set up a card for these.</p>
        </div>
      ) : null}

      <div className="quote-doc-total">
        <span>Your total{subscriptionItems.length > 0 ? ' today' : ''}</span>
        <strong>{totalLabel}</strong>
      </div>

      <SaveButton pendingLabel="Approving..." savedLabel="Approved ✓">Approve quote</SaveButton>
    </form>
  );
}
