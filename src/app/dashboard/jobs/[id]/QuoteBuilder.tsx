'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { QuoteItem, QuoteItemKind, QuoteSubscriptionFrequency } from '@/lib/jobs';

type Row = QuoteItem;

export type PriceBookItem = { id: string; name: string; unitPrice: number; unit: string };

const UNIT_SUFFIX: Record<string, string> = { hour: '/hr', sqft: '/sqft', visit: '/visit', job: '/job' };
const FREQ_LABEL: Record<QuoteSubscriptionFrequency, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
const FREQ_OPTIONS: { id: QuoteSubscriptionFrequency; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
];

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Owner-facing itemized quote editor on the job page. Rows are either base
// (always billed) or optional add-ons the client can accept. The running total
// mirrors what the client will see; Save persists the items and recomputes the
// job's quoted amount server-side.
export default function QuoteBuilder({
  action,
  initialItems,
  services = [],
  onItemsChange,
}: {
  // Job page: persists on its own Save button. Lead form: omit action and pass
  // onItemsChange to feed a parent <form> (the form's submit does the saving).
  action?: (items: QuoteItem[]) => Promise<{ ok: boolean; total: number; message?: string }>;
  initialItems: QuoteItem[];
  services?: PriceBookItem[];
  onItemsChange?: (items: QuoteItem[]) => void;
}) {
  const idCounter = useRef(0);
  const nextId = () => `qi-${Date.now().toString(36)}-${(idCounter.current += 1)}`;
  const [rows, setRows] = useState<Row[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [subDraft, setSubDraft] = useState<{ open: boolean; label: string; amount: string; frequency: QuoteSubscriptionFrequency; term: string; discount: string }>({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' });

  // Report every edit up to a parent in live mode, without re-firing when the
  // parent hands us a new callback identity.
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  useEffect(() => {
    onItemsChangeRef.current?.(rows);
  }, [rows]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setResult(null);
  }

  function addRow(kind: QuoteItemKind) {
    setRows((current) => [...current, { id: nextId(), label: '', amount: 0, kind, selected: kind === 'base', recommended: false }]);
    setResult(null);
  }

  function addFromService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;
    setRows((current) => [...current, { id: nextId(), label: service.name, amount: service.unitPrice, kind: 'base', selected: true, recommended: false }]);
    setResult(null);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setResult(null);
  }

  function addSubscription() {
    const label = subDraft.label.trim();
    const amount = Math.max(0, Number(subDraft.amount) || 0);
    if (!label || amount <= 0) return;
    const termCycles = Math.max(0, Math.floor(Number(subDraft.term) || 0));
    const prepayDiscountPercent = Math.min(100, Math.max(0, Number(subDraft.discount) || 0));
    setRows((current) => [...current, { id: nextId(), label, amount, kind: 'subscription', selected: true, recommended: false, frequency: subDraft.frequency, termCycles, prepayDiscountPercent }]);
    setSubDraft({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' });
    setResult(null);
  }

  // Compact summary shown under a subscription row: its term and pay-in-full offer.
  function subCaption(row: Row): string {
    const parts: string[] = [];
    const term = row.termCycles ?? 0;
    if (term > 0) parts.push(`Ends after ${term} payment${term === 1 ? '' : 's'}`);
    const discount = row.prepayDiscountPercent ?? 0;
    if (term > 0 && discount > 0) {
      const full = (Number(row.amount) || 0) * term * (1 - discount / 100);
      parts.push(`pay in full ${formatUsd(full)} (save ${discount}%)`);
    }
    return parts.join(' · ');
  }

  // One-off total excludes subscriptions — they bill separately on their cadence.
  const total = rows.reduce((sum, row) => (row.kind === 'subscription' ? sum : row.kind === 'base' || row.selected ? sum + (Number(row.amount) || 0) : sum), 0);
  const addonTotal = rows
    .filter((row) => row.kind === 'addon')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const subscriptionRows = rows.filter((row) => row.kind === 'subscription' && row.label.trim());

  function save() {
    if (!action) return;
    const clean = rows
      .map((row) => ({ ...row, label: row.label.trim(), amount: Math.max(0, Number(row.amount) || 0) }))
      .filter((row) => row.label.length > 0);
    startTransition(async () => {
      const res = await action(clean);
      setResult({ ok: res.ok, message: res.ok ? `Saved. Quote total ${formatUsd(res.total)}.` : res.message || 'Could not save the quote.' });
    });
  }

  return (
    <div className="quote-builder">
      {rows.length === 0 ? (
        <p className="empty-state">No line items yet. Add what&apos;s included, then optional add-ons the client can accept.</p>
      ) : (
        <div className="quote-builder-rows">
          {rows.map((row) => (
            <div className={`quote-builder-row quote-builder-row-${row.kind}`} key={row.id}>
              <input
                type="text"
                className="quote-builder-label"
                value={row.label}
                placeholder={row.kind === 'subscription' ? 'e.g. Maintenance Plan' : row.kind === 'base' ? 'e.g. Tear-off and haul-away' : 'e.g. Upgrade to architectural shingles'}
                onChange={(event) => updateRow(row.id, { label: event.target.value })}
                aria-label="Line item description"
              />
              <div className="quote-builder-amount">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount === 0 ? '' : row.amount}
                  placeholder="0"
                  onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) })}
                  aria-label="Line item price"
                />
              </div>
              <div className="quote-builder-controls">
                {row.kind === 'subscription' ? (
                  <>
                    <span className="quote-builder-subtag">Recurring</span>
                    <select
                      value={row.frequency ?? 'monthly'}
                      onChange={(event) => updateRow(row.id, { frequency: event.target.value as QuoteSubscriptionFrequency })}
                      aria-label="Billing frequency"
                    >
                      {FREQ_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      value={row.kind}
                      onChange={(event) => {
                        const kind = event.target.value as QuoteItemKind;
                        updateRow(row.id, { kind, selected: kind === 'base' ? true : row.selected });
                      }}
                      aria-label="Line item type"
                    >
                      <option value="base">Included</option>
                      <option value="addon">Optional add-on</option>
                    </select>
                    {row.kind === 'addon' ? (
                      <>
                        <label className="quote-builder-preselect">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                          />
                          <span>Pre-checked</span>
                        </label>
                        <label className={`quote-builder-recommend${row.recommended ? ' is-on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={row.recommended}
                            onChange={(event) => updateRow(row.id, { recommended: event.target.checked })}
                          />
                          <span>★ Recommend</span>
                        </label>
                      </>
                    ) : null}
                  </>
                )}
                <button type="button" className="quote-builder-remove" onClick={() => removeRow(row.id)} aria-label="Remove line item">×</button>
              </div>
              {row.kind === 'subscription' && ((row.termCycles ?? 0) > 0 || (row.prepayDiscountPercent ?? 0) > 0) ? (
                <p className="quote-builder-subcaption">{subCaption(row)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="quote-builder-actions">
        <button type="button" className="btn secondary" onClick={() => addRow('base')} disabled={pending}>+ Included item</button>
        <button type="button" className="btn secondary" onClick={() => addRow('addon')} disabled={pending}>+ Optional add-on</button>
        <button type="button" className="btn secondary quote-builder-add-sub" onClick={() => setSubDraft((current) => ({ ...current, open: true }))} disabled={pending}>+ Add subscription</button>
        {services.length > 0 ? (
          <select
            className="quote-book-picker"
            value=""
            disabled={pending}
            onChange={(event) => {
              if (event.target.value) addFromService(event.target.value);
              event.target.value = '';
            }}
            aria-label="Add a line item from your price book"
          >
            <option value="">+ From price book…</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {formatUsd(service.unitPrice)}{service.unit && service.unit !== 'each' ? ` ${UNIT_SUFFIX[service.unit] ?? service.unit}` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {subDraft.open ? (
        <div className="quote-builder-subpop">
          <p className="quote-builder-subpop-title">Add a recurring plan</p>
          <input
            className="quote-builder-label"
            type="text"
            placeholder="Plan name — Service Plan, Maintenance Plan, Warranty…"
            value={subDraft.label}
            onChange={(event) => setSubDraft((current) => ({ ...current, label: event.target.value }))}
            aria-label="Subscription name"
          />
          <div className="quote-builder-subpop-row">
            <div className="quote-builder-amount">
              <span aria-hidden="true">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={subDraft.amount}
                onChange={(event) => setSubDraft((current) => ({ ...current, amount: event.target.value }))}
                aria-label="Subscription price"
              />
            </div>
            <select
              value={subDraft.frequency}
              onChange={(event) => setSubDraft((current) => ({ ...current, frequency: event.target.value as QuoteSubscriptionFrequency }))}
              aria-label="Billing frequency"
            >
              {FREQ_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="quote-builder-subpop-row two">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Ends after N payments (optional)"
              value={subDraft.term}
              onChange={(event) => setSubDraft((current) => ({ ...current, term: event.target.value }))}
              aria-label="Term in payments"
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="Pay-in-full discount % (optional)"
              value={subDraft.discount}
              onChange={(event) => setSubDraft((current) => ({ ...current, discount: event.target.value }))}
              aria-label="Pay-in-full discount percent"
            />
          </div>
          <div className="quote-builder-subpop-actions">
            <button type="button" className="btn ghost" onClick={() => setSubDraft({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' })}>Cancel</button>
            <button type="button" className="btn primary" onClick={addSubscription} disabled={!subDraft.label.trim() || !(Number(subDraft.amount) > 0)}>Add plan</button>
          </div>
        </div>
      ) : null}

      <div className="quote-builder-summary">
        <div className="quote-builder-total">
          <span>Quote total</span>
          <strong>{formatUsd(total)}</strong>
        </div>
        {addonTotal > 0 ? (
          <p className="quote-builder-note">Up to {formatUsd(addonTotal)} more if the client accepts every add-on.</p>
        ) : null}
        {subscriptionRows.length > 0 ? (
          <p className="quote-builder-note quote-builder-sub-note">
            Plus {subscriptionRows.map((row) => `${formatUsd(Number(row.amount) || 0)}${FREQ_LABEL[row.frequency ?? 'monthly']}`).join(' + ')} in recurring plans, billed separately.
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="quote-builder-save">
          <button type="button" className="btn primary" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save quote'}
          </button>
          {result ? (
            <small className={`review-request-hint ${result.ok ? 'is-ok' : 'is-error'}`}>{result.message}</small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
