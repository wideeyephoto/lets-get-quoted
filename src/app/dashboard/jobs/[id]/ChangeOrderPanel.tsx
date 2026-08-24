'use client';

import { useState, useTransition } from 'react';
import { formatUsdExact } from '@/lib/money-format';
import type { QuoteItem } from '@/lib/jobs';
import type { SerializedDraft } from '@/lib/quote-draft';
import { AiSparkleButton, AiDiffCard } from '@/components/ai';
import {
  CHANGE_ORDER_STATUS_LABEL,
  changeOrderTotal,
  isEditable,
  sendBlockers,
  type ChangeOrder,
} from '@/lib/change-orders';
import {
  draftChangeOrderAction,
  saveChangeOrderAction,
  sendChangeOrderAction,
  requestChangeOrderPaymentAction,
  voidChangeOrderAction,
} from './change-order-actions';

/**
 * To the cent. change_orders.amount is numeric dollars priced at step="0.01",
 * and the exact figure is added to the job total and raised as a deposit
 * request. The customer's half of this exchange already reads exactly, so a
 * rounded figure here is the contractor and the homeowner discussing one number
 * and seeing two.
 */
const money = formatUsdExact;

type Draft = SerializedDraft & { title: string; scope: string };

/**
 * The owner's side. A crew member's find arrives here as an unpriced draft; this
 * is where it becomes something a customer can agree to.
 *
 * "Write it up" reads the note and the photos and proposes lines — priced from
 * the price book, never by the model. Nothing it produces is applied on its own.
 */
export default function ChangeOrderPanel({ jobId, orders }: { jobId: string; orders: ChangeOrder[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [edits, setEdits] = useState<Record<string, { title: string; scope: string; items: QuoteItem[]; cost: string }>>({});
  const [message, setMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  if (orders.length === 0) return null;

  function editing(order: ChangeOrder) {
    return (
      edits[order.id] ?? {
        title: order.title,
        scope: order.scope,
        items: order.items,
        cost: order.estimatedCost === null ? '' : String(order.estimatedCost),
      }
    );
  }

  function setEdit(order: ChangeOrder, patch: Partial<{ title: string; scope: string; items: QuoteItem[]; cost: string }>) {
    setEdits((current) => ({ ...current, [order.id]: { ...editing(order), ...patch } }));
  }

  function writeUp(order: ChangeOrder) {
    setBusyId(order.id);
    setMessage(null);
    startTransition(async () => {
      const result = await draftChangeOrderAction(jobId, order.id);
      if (result.ok) {
        setDrafts((current) => ({ ...current, [order.id]: result.draft }));
      } else {
        setMessage({ id: order.id, text: result.message, ok: false });
      }
      setBusyId(null);
    });
  }

  function applyDraft(order: ChangeOrder) {
    const draft = drafts[order.id];
    if (!draft) return;
    setEdit(order, { title: draft.title || order.title, scope: draft.scope, items: draft.items });
    setDrafts((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  }

  function save(order: ChangeOrder) {
    const state = editing(order);
    setBusyId(order.id);
    startTransition(async () => {
      const result = await saveChangeOrderAction(jobId, order.id, {
        title: state.title,
        scope: state.scope,
        items: state.items,
        // Blank means unknown. Sending 0 would show the added work at a perfect
        // margin, which is the most misleading thing this panel could say.
        estimatedCost: state.cost.trim() === '' ? null : Number(state.cost),
      });
      setMessage({ id: order.id, text: result.ok ? 'Saved.' : result.message ?? 'Could not save.', ok: Boolean(result.ok) });
      setBusyId(null);
    });
  }

  function send(order: ChangeOrder) {
    setBusyId(order.id);
    startTransition(async () => {
      const result = await sendChangeOrderAction(jobId, order.id);
      setMessage({
        id: order.id,
        text: result.ok ? 'Sent to the customer.' : (result.blockers ?? ['Could not send.']).join(' '),
        ok: result.ok,
      });
      setBusyId(null);
    });
  }

  function requestPayment(order: ChangeOrder) {
    setBusyId(order.id);
    startTransition(async () => {
      const result = await requestChangeOrderPaymentAction(jobId, order.id);
      setMessage({ id: order.id, text: result.ok ? 'Payment requested.' : result.message ?? 'Could not request payment.', ok: Boolean(result.ok) });
      setBusyId(null);
    });
  }

  function withdraw(order: ChangeOrder) {
    setBusyId(order.id);
    startTransition(async () => {
      const result = await voidChangeOrderAction(jobId, order.id);
      setMessage({ id: order.id, text: result.ok ? 'Withdrawn.' : result.message ?? 'Could not withdraw.', ok: Boolean(result.ok) });
      setBusyId(null);
    });
  }

  return (
    <div className="change-order-list">
      {orders.map((order) => {
        const state = editing(order);
        const draft = drafts[order.id];
        const total = changeOrderTotal(state.items);
        const blockers = sendBlockers({ ...order, ...state, amount: total });
        const editable = isEditable(order.status);
        const busy = pending && busyId === order.id;

        return (
          <article key={order.id} className={`change-order status-${order.status}`}>
            <header className="change-order-head">
              <div>
                <strong>{order.title}</strong>
                <span className="change-order-status">{CHANGE_ORDER_STATUS_LABEL[order.status]}</span>
              </div>
              <span className="change-order-amount">{money(order.status === 'draft' ? total : order.amount)}</span>
            </header>

            {/* The crew member's own words, always shown and never edited away.
                This is the primary record of what was found on site. */}
            <blockquote className="change-order-note">
              {order.fieldNote}
              {order.crewName ? <cite>— {order.crewName}</cite> : null}
            </blockquote>

            {order.photoPaths.length > 0 ? (
              <p className="change-order-photos">
                {order.photoPaths.length} photo{order.photoPaths.length === 1 ? '' : 's'} attached.
              </p>
            ) : null}

            {editable ? (
              <>
                <div className="change-order-actions" style={{ alignItems: 'center', gap: '0.75rem' }}>
                  <AiSparkleButton onClick={() => writeUp(order)} loading={busy} loadingLabel="Analyzing site notes & photos...">
                    AI Write-Up
                  </AiSparkleButton>
                  <small>Reads the note and photos, then itemizes & prices the lines from your price book.</small>
                </div>

                {draft ? (
                  <AiDiffCard
                    title={draft.title || 'Proposed Change Order'}
                    description={draft.scope}
                    items={draft.items.map((line) => ({
                      id: line.id,
                      type: 'addition',
                      label: line.label,
                      amount: line.amount,
                    }))}
                    applyLabel="Apply to Change Order"
                    discardLabel="Discard"
                    onApply={() => applyDraft(order)}
                    onDiscard={() => setDrafts((c) => { const n = { ...c }; delete n[order.id]; return n; })}
                  />
                ) : null}

                <div className="change-order-fields">
                  <label htmlFor={`co-title-${order.id}`}>Title the customer sees</label>
                  <input id={`co-title-${order.id}`} value={state.title} onChange={(e) => setEdit(order, { title: e.currentTarget.value })} />

                  <label htmlFor={`co-scope-${order.id}`}>What you&apos;re telling them</label>
                  <textarea id={`co-scope-${order.id}`} rows={3} value={state.scope} onChange={(e) => setEdit(order, { scope: e.currentTarget.value })} />

                  <label htmlFor={`co-cost-${order.id}`}>What it costs you (optional)</label>
                  <input
                    id={`co-cost-${order.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.cost}
                    onChange={(e) => setEdit(order, { cost: e.currentTarget.value })}
                    placeholder="Leave blank if you don't know"
                  />
                </div>

                {blockers.length > 0 ? (
                  <ul className="change-order-blockers">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="change-order-actions">
                  <button type="button" className="btn secondary" onClick={() => save(order)} disabled={busy}>
                    Save
                  </button>
                  <button type="button" className="btn primary" onClick={() => send(order)} disabled={busy || blockers.length > 0}>
                    Send to customer
                  </button>
                  <button type="button" className="btn ghost" onClick={() => withdraw(order)} disabled={busy}>
                    Withdraw
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="change-order-scope">{order.scope}</p>
                {order.signatureName ? (
                  <p className="change-order-signature">
                    {order.status === 'approved' ? 'Approved' : 'Declined'} by {order.signatureName}
                    {order.declineReason ? ` — “${order.declineReason}”` : ''}
                  </p>
                ) : null}
                {/* Sent and settled orders are frozen. Changing the price of
                    something a customer is looking at rewrites a deal under
                    them, which is the dispute this whole feature prevents. */}
                {order.status === 'sent' ? (
                  <div className="change-order-actions">
                    <small>With the customer. Withdraw it and raise a new one rather than changing it under them.</small>
                    <button type="button" className="btn ghost" onClick={() => withdraw(order)} disabled={busy}>
                      Withdraw
                    </button>
                  </div>
                ) : null}

                {/* Billing is the owner's call, not an automatic consequence of
                    approval. Some of these get invoiced at the end; asking for
                    money the second somebody says yes is a poor thank-you. */}
                {order.status === 'approved' ? (
                  <div className="change-order-actions">
                    {order.paymentId ? (
                      <small>Already billed. {money(order.amount)} was added to this job&apos;s total when they approved it.</small>
                    ) : (
                      <>
                        <small>{money(order.amount)} was added to this job&apos;s total. Bill it now, or leave it for the final invoice.</small>
                        <button type="button" className="btn secondary" onClick={() => requestPayment(order)} disabled={busy}>
                          Request payment
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {message?.id === order.id ? (
              <p className={`change-order-message${message.ok ? '' : ' is-error'}`}>{message.text}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
