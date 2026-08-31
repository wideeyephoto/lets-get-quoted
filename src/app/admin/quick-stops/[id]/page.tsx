import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getQuickStopAdminDetail } from '@/lib/admin-quick-stops';
import { accountDisplayName } from '@/lib/admin-accounts';
import { QUICK_STOP_STATUS_LABEL, centsToDollars, type QuickStopStatus } from '@/lib/quick-stop';
import styles from '../../admin.module.css';
import QuickStopAdminActions from './QuickStopAdminActions';

export const dynamic = 'force-dynamic';

function money(cents: number | null | undefined): string {
  if (!cents) return '$0';
  return `$${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

const DONE: Record<string, string> = {
  refunded: 'Refund issued.',
  resolved: 'Resolution applied.',
};
const ERR: Record<string, string> = {
  amount: 'Enter a valid dollar amount.',
  refund: 'The refund failed at Stripe — check the payment and retry.',
  nopayment: 'This request has no captured payment.',
  outcome: 'Pick a resolution.',
  notfound: 'Request not found.',
  reason: 'Enter an internal reason of at least four characters.',
  state: 'The request could not be updated. Nothing was reported as completed.',
  refund_state: 'The refund succeeded, but the Quick Stop record did not update. Do not refund again; reconcile this request from the payment detail.',
};

export default async function AdminQuickStopDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const { admin, role } = await requireAdmin();
  const detail = await getQuickStopAdminDetail(admin, params.id);
  if (!detail) notFound();

  const r = detail.request;
  const status = r.status as QuickStopStatus;
  const canRefund = Boolean(r.payment_id && r.paid_at && (r.refund_cents ?? 0) < (r.fee_cents ?? 0));

  return (
    <>
      <Link href="/admin/quick-stops" className={styles.backLink}>← Quick Stops</Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Quick Stop</p>
        <h1 className={styles.title}>{r.client_name || 'Customer'}</h1>
        <p className={styles.lead}>
          <Link href={`/admin/accounts/${r.account_id}`} className={styles.rowLink}>{accountDisplayName({ company_name: detail.company_name, business_name: detail.business_name })}</Link>
          {detail.account_number ? ` · #${detail.account_number}` : ''} · created {fmtDateTime(r.created_at)}
        </p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          <span className={`${styles.pill} ${styles.accent}`}>{QUICK_STOP_STATUS_LABEL[status] ?? status}</span>
          {r.refund_cents ? <span className={`${styles.pill} ${styles.warn}`}>Refunded {money(r.refund_cents)}</span> : null}
        </div>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERR[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Request</h2>
            <dl className={styles.kv}>
              <dt>Job</dt><dd>{r.ai_summary || <span className={styles.muted}>—</span>}</dd>
              <dt>Customer</dt><dd>{r.client_name || '—'}{r.client_phone ? ` · ${r.client_phone}` : ''}{r.client_email ? ` · ${r.client_email}` : ''}</dd>
              <dt>Address</dt><dd>{r.address || <span className={styles.muted}>—</span>}</dd>
              <dt>Arrival window</dt><dd>{r.arrival_date ? `${r.arrival_date}${r.arrival_start ? `, ${fmtTime(r.arrival_start)}–${fmtTime(r.arrival_end)}` : ''}` : <span className={styles.muted}>—</span>}</dd>
              <dt>Fee</dt><dd>{money(r.fee_cents)}{r.diagnostic_fee_cents ? ` + ${money(r.diagnostic_fee_cents)} diagnostic` : ''}</dd>
              <dt>Refunded</dt><dd>{r.refund_cents ? money(r.refund_cents) : '$0'}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Payment & verification</h2>
            <dl className={styles.kv}>
              <dt>Payment status</dt><dd>{detail.payment ? <span className={`${styles.pill} ${detail.payment.status === 'paid' ? styles.good : detail.payment.status === 'refunded' ? styles.warn : styles.neutral}`}>{detail.payment.status}</span> : <span className={styles.muted}>none</span>}</dd>
              <dt>Paid at</dt><dd>{fmtDateTime(r.paid_at)}</dd>
              <dt>En route</dt><dd>{fmtDateTime(r.en_route_at)}</dd>
              <dt>Arrived</dt><dd>{fmtDateTime(r.arrived_at)}</dd>
              <dt>No-show reported</dt><dd>{fmtDateTime(r.no_show_reported_at)}</dd>
              <dt>Canceled</dt><dd>{fmtDateTime(r.canceled_at)}{r.cancel_reason ? ` — ${r.cancel_reason}` : ''}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Timeline</h2>
            {detail.events.length === 0 ? (
              <p className={styles.emptyState}>No recorded events.</p>
            ) : (
              <ul className={styles.timeline}>
                {detail.events.map((e) => (
                  <li key={e.id}>
                    <time>{fmtDateTime(e.created_at)}</time>
                    <span>
                      <span className={styles.timelineActor}>{e.actor}</span>
                      {e.from_status || e.to_status ? <> · {e.from_status ?? '—'} → {e.to_status ?? '—'}</> : null}
                      {e.meta && Object.keys(e.meta).length ? <span className={styles.muted}> · {summarizeMeta(e.meta)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <QuickStopAdminActions requestId={r.id} canRefund={canRefund} feeLabel={money(r.fee_cents)} role={role} />
        </div>
      </div>
    </>
  );
}

function summarizeMeta(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('refundCents' in meta) parts.push(`refund ${money(Number(meta.refundCents))}`);
  if ('refundedTotalCents' in meta) parts.push(`refunded ${money(Number(meta.refundedTotalCents))}`);
  if ('pct' in meta) parts.push(`${meta.pct}%`);
  if ('reason' in meta && meta.reason) parts.push(String(meta.reason));
  if ('by' in meta && meta.by) parts.push(`by ${meta.by}`);
  return parts.join(' · ') || Object.keys(meta).slice(0, 3).join(', ');
}
