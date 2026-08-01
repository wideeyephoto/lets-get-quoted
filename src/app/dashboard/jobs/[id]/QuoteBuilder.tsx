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

  // Order is what the client reads top to bottom, so it's a pricing decision:
  // the thing you want accepted should not be stuck at the bottom just because
  // it was typed last.
  function moveRow(id: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
          {rows.map((row, index) => (
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
                  </>
                )}
                <span className="quote-builder-move">
                  <button
                    type="button"
                    onClick={() => moveRow(row.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move "${row.label.trim() || 'this item'}" up`}
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveRow(row.id, 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`Move "${row.label.trim() || 'this item'}" down`}
                  >↓</button>
                </span>
                <button type="button" className="quote-builder-remove" onClick={() => removeRow(row.id)} aria-label="Remove line item">×</button>
              </div>

              {/* Add-on options get their own line. Sharing the controls row with
                  the type dropdown and the remove button left four controls
                  fighting one `auto` column — the price box collapsed to about
                  the width of its own "$", on the row whose price matters most.
                  A second line also leaves room to say what the two options DO,
                  which the labels alone never did. */}
              {row.kind === 'addon' ? (
                <div className="quote-builder-addon-options">
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
                  <small className="quote-builder-addon-note">
                    Pre-checked starts ticked on the client&apos;s quote — they can untick it. Recommend adds a gold star beside it.
                  </small>
                </div>
              ) : null}
              {row.kind === 'subscription' && ((row.termCycles ?? 0) > 0 || (row.prepayDiscountPercent ?? 0) > 0) ? (
                <p className="quote-builder-subcaption">{subCaption(row)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Sits with the line items, above the add buttons — a new plan is another
          row in the quote, and appearing BELOW the "+ Add subscription" button
          read as a separate thing that had nothing to do with the list. */}
      {subDraft.open ? <SubscriptionDraft draft={subDraft} setDraft={setSubDraft} onAdd={addSubscription} /> : null}

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

type SubDraft = { open: boolean; label: string; amount: string; frequency: QuoteSubscriptionFrequency; term: string; discount: string };

// The recurring-plan composer. Pulled out of the main render so it can sit up
// with the line items rather than trailing the add buttons.
//
// Every field carries a real label now. These were four placeholder-only inputs,
// and a placeholder disappears the moment you type — so "is this box the term or
// the discount?" had no answer once either was filled, on the one control that
// decides how long a customer gets billed.
function SubscriptionDraft({
  draft,
  setDraft,
  onAdd,
}: {
  draft: SubDraft;
  setDraft: (update: (current: SubDraft) => SubDraft) => void;
  onAdd: () => void;
}) {
  return (
    <div className="quote-builder-subpop">
      <p className="quote-builder-subpop-title">Add a recurring subscription / service plan</p>
      <label className="quote-builder-subfield">
        <span>Plan name</span>
        <input
          className="quote-builder-label"
          type="text"
          placeholder="Service Plan, Maintenance Plan, Warranty…"
          value={draft.label}
          onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
        />
      </label>
      <div className="quote-builder-subpop-row">
        <label className="quote-builder-subfield">
          <span>Price per payment</span>
          <div className="quote-builder-amount">
            <span aria-hidden="true">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
        </label>
        <label className="quote-builder-subfield">
          <span>Billed</span>
          <select
            value={draft.frequency}
            onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value as QuoteSubscriptionFrequency }))}
          >
            {FREQ_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="quote-builder-subpop-row two">
        <label className="quote-builder-subfield">
          <span># of payments</span>
          <input type="number" min="0" step="1" placeholder="Leave blank to bill indefinitely" value={draft.term} onChange={(event) => setDraft((current) => ({ ...current, term: event.target.value }))} />
          <small>Leave blank for an indefinite recurring plan — it bills until someone cancels.</small>
        </label>
        <label className="quote-builder-subfield">
          <span>Pay-in-full discount</span>
          <input type="number" min="0" max="100" step="1" placeholder="Optional — e.g. 10" value={draft.discount} onChange={(event) => setDraft((current) => ({ ...current, discount: event.target.value }))} />
          <small>A % off if they pay the whole term up front. Needs a number of payments above.</small>
        </label>
      </div>
      <div className="quote-builder-subpop-actions">
        <button type="button" className="btn ghost" onClick={() => setDraft(() => ({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' }))}>Cancel</button>
        <button type="button" className="btn primary" onClick={onAdd} disabled={!draft.label.trim() || !(Number(draft.amount) > 0)}>Add plan</button>
      </div>
    </div>
  );
}
