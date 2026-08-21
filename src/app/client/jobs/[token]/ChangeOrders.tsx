'use client';

import { useState, useTransition } from 'react';
import { formatUsdExact } from '@/lib/money-format';
import type { ClientChangeOrder } from '@/lib/change-orders';
import { respondToChangeOrderAction } from './change-order-actions';

/**
 * TO THE CENT, because this is a consent surface and the figure is charged.
 *
 * maximumFractionDigits: 0 rounded every line AND the total directly above the
 * "Type your name to confirm" box. A $137.50 and a $412.50 line printed as $138
 * and $413 under a header of $550 -- the parts visibly failing to make the
 * whole, on the screen where somebody signs for it. The exact amount is then
 * added to jobs.quoted_amount and raised as a deposit request.
 *
 * Every other figure on this page was already exact: the page imports
 * formatMoneyExact, so only this block disagreed with the deposit, the
 * installments and the job total beside it.
 */
const money = formatUsdExact;

/**
 * Extra work the contractor found, and the homeowner's decision about it.
 *
 * Approve and Decline are given the SAME weight. A page that makes approving a
 * one-tap primary button and declining a grey link is a page designed to
 * extract a yes, and the whole value of a written record is that the answer was
 * freely given.
 */
export default function ChangeOrders({ token, orders }: { token: string; orders: ClientChangeOrder[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (orders.length === 0) return null;

  function submit(orderId: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await respondToChangeOrderAction(token, orderId, formData);
      if (result.ok) {
        setOpen(null);
        setDecision(null);
      } else {
        setError(result.message ?? 'Could not record that. Try again.');
      }
    });
  }

  return (
    <section className="panel workspace-section-card client-change-orders">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Additional work</p>
        <h2>Things we found that weren&apos;t in the original quote</h2>
      </div>

      <div className="client-co-list">
        {orders.map((order) => (
          <article key={order.id} className={`client-co${order.awaitingDecision ? ' is-open' : ''}`}>
            <div className="client-co-head">
              <div>
                <strong>{order.title}</strong>
                {order.statusLabel ? <span className="client-co-status">{order.statusLabel}</span> : null}
              </div>
              <span className="client-co-amount">{money(order.amount)}</span>
            </div>

            <p className="client-co-scope">{order.scope}</p>

            {order.items.length > 1 ? (
              <ul className="client-co-items">
                {order.items.map((line, index) => (
                  <li key={`${order.id}-${index}`}>
                    <span>{line.label}</span>
                    <span>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {order.photoCount > 0 ? (
              <p className="client-co-photos">
                {order.photoCount} photo{order.photoCount === 1 ? '' : 's'} of what we found — ask us to send them if
                you&apos;d like to see.
              </p>
            ) : null}

            {order.awaitingDecision ? (
              open === order.id ? (
                <form
                  className="client-co-form"
                  action={(formData) => {
                    formData.set('decision', decision ?? 'approved');
                    submit(order.id, formData);
                  }}
                >
                  <label htmlFor={`sig-${order.id}`}>Type your name to confirm</label>
                  <input id={`sig-${order.id}`} name="signatureName" required autoComplete="name" placeholder="Jane Homeowner" />
                  {decision === 'declined' ? (
                    <>
                      <label htmlFor={`why-${order.id}`}>Anything you&apos;d like to say? (optional)</label>
                      <textarea id={`why-${order.id}`} name="declineReason" rows={2} maxLength={500} />
                    </>
                  ) : null}
                  <div className="client-co-actions">
                    <button type="submit" className="btn primary" disabled={pending}>
                      {pending ? 'Sending…' : decision === 'declined' ? 'Confirm decline' : 'Confirm approval'}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => { setOpen(null); setDecision(null); }} disabled={pending}>
                      Back
                    </button>
                  </div>
                </form>
              ) : (
                <div className="client-co-actions">
                  <button type="button" className="btn secondary" onClick={() => { setOpen(order.id); setDecision('approved'); }}>
                    Approve this work
                  </button>
                  <button type="button" className="btn secondary" onClick={() => { setOpen(order.id); setDecision('declined'); }}>
                    Decline
                  </button>
                </div>
              )
            ) : null}
          </article>
        ))}
      </div>

      {error ? <p className="client-co-error">{error}</p> : null}
      <p className="client-co-foot">
        Approving adds this to your job total. Declining is fine — we&apos;ll carry on with the work you already
        agreed to, and the note stays on your job so we both have a record.
      </p>
    </section>
  );
}
