import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { listAdminActions } from '@/lib/admin';
import {
  getPaymentForAdmin,
  refundBlockedReason,
  refundableCents,
  stripePaymentUrl,
} from '@/lib/admin-payments';
import { staffCan } from '@/lib/staff';
import { refundPaymentAction } from './actions';
import styles from '../../admin.module.css';

/**
 * One payment, with the one control the console was missing.
 *
 * Everything here was reachable before — the account page lists recent
 * payments, Universal Search matches a Stripe payment_intent — but every route
 * ended at a read-only row. This is where a refund can be issued with a reason
 * against it, which is the difference between the money moving and the money
 * moving accountably.
 */

export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = {
  refunded: 'Refund issued. Stripe will confirm it by webhook within a few seconds.',
};
const ERRORS: Record<string, string> = {
  notfound: 'That payment no longer exists.',
  reason: 'Say why you are refunding this. It is the whole point of doing it here rather than in Stripe.',
  amount: 'Enter a refund amount greater than zero, or leave it blank for the full remaining balance.',
  blocked: 'This payment cannot be refunded any more — it may have been disputed or refunded since you loaded the page.',
  refund: 'Stripe refused the refund.',
};

function usd(v: number | null | undefined): string {
  return `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function usdCents(cents: number): string {
  return usd(cents / 100);
}
function fmt(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function statusPill(status: string | null) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}

export default async function AdminPaymentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { done?: string; error?: string; detail?: string };
}) {
  const ctx = await requireAdmin();
  const payment = await getPaymentForAdmin(ctx.admin, params.id);
  if (!payment) notFound();

  const [{ data: acct }, actions] = await Promise.all([
    ctx.admin.from('accounts').select('id, business_name, account_number').eq('id', payment.account_id).maybeSingle(),
    // This payment's own history. A refund issued from here writes one of
    // these, which is the record that did not exist when the only way to refund
    // was the Stripe dashboard.
    listAdminActions(ctx.admin, { accountId: payment.account_id, limit: 50 }),
  ]);
  const account: { business_name: string | null; account_number: number | null } =
    (acct as { business_name: string | null; account_number: number | null } | null) ??
    { business_name: null, account_number: null };
  const paymentActions = actions.filter((a) => a.target_type === 'payment' && a.target_id === params.id);

  const mayRefund = staffCan(ctx.staff, 'money.refund');
  const blocked = refundBlockedReason(payment);
  const remaining = refundableCents(payment);
  const stripeUrl = stripePaymentUrl(payment);
  const netFee = (Number(payment.platform_fee) || 0) - (Number(payment.platform_fee_refunded) || 0);

  return (
    <>
      <Link href={`/admin/accounts/${payment.account_id}`} className={styles.backLink}>← {accountDisplayName(account)}</Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Payment</p>
        <h1 className={styles.title}>{payment.label || 'Payment'}</h1>
        <p className={styles.lead}>
          {usd(payment.amount)} · {payment.kind ?? 'payment'} ·{' '}
          <Link href={`/admin/accounts/${payment.account_id}`} className={styles.rowLink}>{accountDisplayName(account)}</Link>
          {account.account_number ? <span className={styles.muted}> · #{account.account_number}</span> : null}
        </p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          {statusPill(payment.status)}
          {Number(payment.refunded_amount) > 0 ? (
            <span className={`${styles.pill} ${styles.warn}`}>{usd(payment.refunded_amount)} refunded</span>
          ) : null}
          {payment.disputed_at ? <span className={`${styles.pill} ${styles.bad}`}>Disputed</span> : null}
        </div>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? (
        <div className={`${styles.banner} ${styles.err}`}>
          {ERRORS[searchParams.error] ?? 'Something went wrong.'}
          {/* Stripe's own wording, passed through. "You can refund at most
              $412.00" tells the operator what to type next; a generic failure
              message sends them to Stripe to find out. */}
          {searchParams.detail ? <div style={{ marginTop: '.4rem', fontSize: '.85rem' }}>{searchParams.detail}</div> : null}
        </div>
      ) : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>The money</h2>
            <dl className={styles.kv}>
              <dt>Charged</dt><dd>{usd(payment.amount)}</dd>
              <dt>Refunded so far</dt>
              <dd>{Number(payment.refunded_amount) > 0 ? <strong>{usd(payment.refunded_amount)}</strong> : '$0.00'}</dd>
              <dt>Still refundable</dt>
              <dd>{remaining > 0 ? usdCents(remaining) : <span className={styles.muted}>nothing</span>}</dd>
              <dt>Our fee</dt>
              <dd>
                {usd(netFee)}
                {Number(payment.platform_fee_refunded) > 0 ? (
                  <span className={styles.muted} style={{ fontSize: '.75rem' }}>
                    {' '}({usd(payment.platform_fee)} charged − {usd(payment.platform_fee_refunded)} returned)
                  </span>
                ) : null}
                {payment.fee_rate ? <span className={styles.muted} style={{ fontSize: '.75rem' }}> · {(Number(payment.fee_rate) * 100).toFixed(2)}%</span> : null}
              </dd>
              <dt>Requested</dt><dd className={styles.muted}>{fmt(payment.requested_at ?? payment.created_at)}</dd>
              <dt>Paid</dt><dd className={styles.muted}>{fmt(payment.paid_at)}</dd>
              {payment.refunded_at ? <><dt>Last refunded</dt><dd className={styles.muted}>{fmt(payment.refunded_at)}</dd></> : null}
            </dl>
          </section>

          {payment.disputed_at ? (
            <section className={styles.panel} style={{ borderColor: 'rgba(252,165,165,0.4)' }}>
              <h2 className={styles.panelTitle}>Dispute</h2>
              <dl className={styles.kv}>
                <dt>Opened</dt><dd>{fmt(payment.disputed_at)}</dd>
                <dt>Reason</dt><dd>{payment.dispute_reason || '—'}</dd>
                <dt>Status</dt><dd>{payment.dispute_status || '—'}</dd>
                <dt>Respond by</dt>
                <dd>
                  {payment.dispute_due_by ? (
                    <span className={`${styles.pill} ${new Date(payment.dispute_due_by).getTime() < Date.now() ? styles.bad : styles.warn}`}>
                      {fmt(payment.dispute_due_by)}
                    </span>
                  ) : '—'}
                </dd>
              </dl>
              {payment.stripe_dispute_id ? (
                <div className={styles.actionRow} style={{ marginTop: '.8rem' }}>
                  <a href={`https://dashboard.stripe.com/disputes/${payment.stripe_dispute_id}`} target="_blank" rel="noreferrer" className="btn secondary">
                    Respond on Stripe →
                  </a>
                </div>
              ) : null}
            </section>
          ) : null}

          {payment.dunning_state || payment.failed_at ? (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Collection trouble</h2>
              <dl className={styles.kv}>
                <dt>State</dt><dd>{payment.dunning_state || '—'}</dd>
                <dt>Last failed</dt><dd className={styles.muted}>{fmt(payment.failed_at)}</dd>
                <dt>Reason</dt><dd>{payment.failure_message || '—'}</dd>
              </dl>
            </section>
          ) : null}

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Staff actions on this payment</h2>
            {paymentActions.length === 0 ? (
              <p className={styles.emptyState}>
                Nothing recorded. A refund issued in the Stripe dashboard would not appear here — only one issued from
                this page carries a name and a reason.
              </p>
            ) : (
              <ul className={styles.timeline}>
                {paymentActions.map((a) => (
                  <li key={a.id}>
                    <time>{fmt(a.created_at)}</time>
                    <span>
                      <span className={styles.timelineActor}>{a.admin_email}</span>
                      {' '}{a.action.replace(/_/g, ' ')}
                      {a.reason ? <span className={styles.muted}> — {a.reason}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Refund</h2>
            {!mayRefund ? (
              <p className={styles.muted} style={{ fontSize: '.82rem' }}>Issuing refunds needs the finance role.</p>
            ) : blocked ? (
              <p className={styles.muted} style={{ fontSize: '.82rem' }}>{blocked}</p>
            ) : (
              <form action={refundPaymentAction.bind(null, params.id)} className={styles.formStack}>
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  className={styles.input}
                  name="amount"
                  inputMode="decimal"
                  placeholder={`Blank = all ${usdCents(remaining)}`}
                />
                <p className={styles.muted} style={{ margin: '.2rem 0 .6rem', fontSize: '.76rem' }}>
                  Up to {usdCents(remaining)}. Our platform fee and the contractor&rsquo;s share come back in
                  proportion, so a refund is not funded out of the platform balance alone.
                </p>

                <label htmlFor="reason">Why</label>
                {/* Required, unlike the Quick Stop refund, which has four fixed
                    outcomes that explain themselves. This is a free amount
                    against an arbitrary charge, and "why" is the entire reason
                    to do it here instead of in Stripe. */}
                <input id="reason" className={styles.input} name="reason" placeholder="Duplicate charge, goodwill, billing error…" />
                <p className={styles.muted} style={{ margin: '.2rem 0 .6rem', fontSize: '.76rem' }}>
                  Required. This is what makes the refund answerable later.
                </p>

                <button type="submit" className="btn primary">Issue refund</button>
              </form>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>References</h2>
            <dl className={styles.kv}>
              <dt>Payment</dt><dd className={styles.muted}><code style={{ fontSize: '.72rem' }}>{payment.id}</code></dd>
              <dt>Stripe intent</dt>
              <dd className={styles.muted}><code style={{ fontSize: '.72rem' }}>{payment.stripe_payment_intent || '—'}</code></dd>
              <dt>Job</dt>
              <dd>{payment.job_id ? <code className={styles.muted} style={{ fontSize: '.72rem' }}>{payment.job_id}</code> : <span className={styles.muted}>—</span>}</dd>
            </dl>
            {stripeUrl ? (
              <div className={styles.actionRow} style={{ marginTop: '.8rem' }}>
                <a href={stripeUrl} target="_blank" rel="noreferrer" className="btn secondary">Open in Stripe →</a>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
