'use client';

import { useEffect, useState } from 'react';
import styles from '../leads.module.css';

type PreviewFrequency = 'weekly' | 'biweekly' | 'monthly';
type PreviewItem = { id: string; label: string; amount: number; kind: 'base' | 'addon' | 'subscription'; selected: boolean; recommended: boolean; frequency: PreviewFrequency; termCycles: number; prepayDiscountPercent: number };

const FREQ_SUFFIX: Record<PreviewFrequency, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// The term + pay-in-full line shown under a subscription, as the client sees it.
function subCaption(item: PreviewItem): string {
  const parts: string[] = [];
  if (item.termCycles > 0) parts.push(`${item.termCycles} payments`);
  if (item.termCycles > 0 && item.prepayDiscountPercent > 0) {
    const full = item.amount * item.termCycles * (1 - item.prepayDiscountPercent / 100);
    parts.push(`or ${formatUsd(full)} up front — save ${item.prepayDiscountPercent}%`);
  }
  return parts.join(' · ');
}

// Reads the live itemized quote from the hidden #quoteItems field the lead form
// keeps in sync, dropping unlabeled rows (which the server drops too).
function readItems(): PreviewItem[] {
  const el = document.getElementById('quoteItems') as HTMLInputElement | null;
  if (!el?.value) return [];
  try {
    const parsed = JSON.parse(el.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.label === 'string' && item.label.trim() && Number.isFinite(Number(item.amount)))
      .map((item) => ({
        id: String(item.id ?? Math.random()),
        label: String(item.label).trim(),
        amount: Math.max(0, Number(item.amount) || 0),
        kind: item.kind === 'addon' ? 'addon' : item.kind === 'subscription' ? 'subscription' : 'base',
        selected: item.kind === 'addon' ? Boolean(item.selected) : true,
        recommended: Boolean(item.recommended),
        frequency: (item.frequency === 'weekly' ? 'weekly' : item.frequency === 'biweekly' ? 'biweekly' : 'monthly') as PreviewFrequency,
        termCycles: Math.max(0, Math.floor(Number(item.termCycles) || 0)),
        prepayDiscountPercent: Math.min(100, Math.max(0, Number(item.prepayDiscountPercent) || 0)),
      }));
  } catch {
    return [];
  }
}

// Shows the contractor exactly what their client sees when the quote lands — the
// branded approval screen with base line items and optional upsells — reusing
// the real client quote-document markup/styles so the preview matches production.
export default function QuotePreviewButton({
  businessName,
  clientName,
}: {
  businessName: string;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  // Live add-on selection so the preview toggles exactly like the client's
  // screen — showing the contractor that clients can add or remove upsells.
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  function openPreview() {
    const next = readItems();
    setItems(next);
    setSelected(Object.fromEntries(next.filter((item) => item.kind === 'addon').map((item) => [item.id, item.selected])));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const baseItems = items.filter((item) => item.kind === 'base');
  const addonItems = items.filter((item) => item.kind === 'addon');
  const subscriptionItems = items.filter((item) => item.kind === 'subscription');
  const total = baseItems.reduce((sum, item) => sum + item.amount, 0) + addonItems.filter((item) => selected[item.id]).reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <button type="button" className={`btn ghost ${styles.previewQuoteBtn}`} onClick={openPreview}>
        <span aria-hidden="true">👁</span> Preview
      </button>
      {open ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Quote preview" onClick={() => setOpen(false)}>
          <section className={styles.quotePreviewCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.quotePreviewBar}>
              <span><span aria-hidden="true">👁</span> Preview — what your client sees</span>
              <button type="button" className={styles.modalCloseButton} onClick={() => setOpen(false)} aria-label="Close preview">x</button>
            </div>
            <div className={styles.quotePreviewStage}>
              <div className={styles.quotePreviewHero}>
                <p className="eyebrow">{businessName}</p>
                <h3>{clientName || 'Your client'}</h3>
              </div>
              <p className={styles.quotePreviewHeading}>Approve your quote</p>
              {baseItems.length === 0 && addonItems.length === 0 && subscriptionItems.length === 0 ? (
                <p className={styles.quotePreviewNote}>Add line items and they’ll show here exactly as your client sees them.</p>
              ) : (
                <>
                <div className="quote-document">
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
                            <span className="quote-doc-line-amount">{formatUsd(item.amount)}{FREQ_SUFFIX[item.frequency]}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="quote-doc-total">
                    <span>Your total{subscriptionItems.length > 0 ? ' today' : ''}</span>
                    <strong>{formatUsd(total)}</strong>
                  </div>
                  <button type="button" className="btn primary" disabled>Approve quote</button>
                </div>
                {addonItems.length > 0 ? (
                  <p className={styles.quotePreviewNote}>Add-ons are interactive here, exactly like your client sees — toggle one to watch the total update.</p>
                ) : null}
                {subscriptionItems.length > 0 ? (
                  <p className={styles.quotePreviewNote}>Recurring plans bill separately on their own schedule — the client signs up when they approve.</p>
                ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
