'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { QuoteItem, QuoteItemKind } from '@/lib/jobs';

type Row = QuoteItem;

export type PriceBookItem = { id: string; name: string; unitPrice: number; unit: string };

const UNIT_SUFFIX: Record<string, string> = { hour: '/hr', sqft: '/sqft', visit: '/visit', job: '/job' };

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

  const total = rows.reduce((sum, row) => (row.kind === 'base' || row.selected ? sum + (Number(row.amount) || 0) : sum), 0);
  const addonTotal = rows
    .filter((row) => row.kind === 'addon')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

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
                placeholder={row.kind === 'base' ? 'e.g. Tear-off and haul-away' : 'e.g. Upgrade to architectural shingles'}
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
                <button type="button" className="quote-builder-remove" onClick={() => removeRow(row.id)} aria-label="Remove line item">×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="quote-builder-actions">
        <button type="button" className="btn secondary" onClick={() => addRow('base')} disabled={pending}>+ Included item</button>
        <button type="button" className="btn secondary" onClick={() => addRow('addon')} disabled={pending}>+ Optional add-on</button>
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

      <div className="quote-builder-summary">
        <div className="quote-builder-total">
          <span>Quote total</span>
          <strong>{formatUsd(total)}</strong>
        </div>
        {addonTotal > 0 ? (
          <p className="quote-builder-note">Up to {formatUsd(addonTotal)} more if the client accepts every add-on.</p>
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
