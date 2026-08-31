import type { ReactNode } from 'react';
import { createAdminClient } from '@/lib/auth';
import { getQuickStopRequestById } from '@/lib/quick-stop-requests';
import { QUICK_STOP_STATUS_LABEL, centsToDollars, type QuickStopStatus } from '@/lib/quick-stop';
import { loadRefundTiers } from '@/lib/quick-stop-refunds';
import { renderRefundPolicy } from '@/lib/quick-stop-policy';
import {
  customerCancelQuickStopAction,
  reportNoShowQuickStopAction,
  acceptRevisedWindowQuickStopAction,
  declineRevisedWindowQuickStopAction,
  approveDiagnosticConversionAction,
  declineDiagnosticConversionAction,
} from './actions';

export const dynamic = 'force-dynamic';

function fmtTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}
function money(cents: number | null): string {
  if (!cents) return '$0';
  return `$${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default async function QuickStopStatusPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, params.id);

  const shell = (children: ReactNode) => (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">{children}</div>
      </section>
    </main>
  );

  if (!req) {
    return shell(
      <>
        <p className="eyebrow">Quick Stop</p>
        <h1 className="workspace-title">We couldn’t find that request</h1>
        <p className="workspace-lead">This link may be old or incorrect.</p>
      </>,
    );
  }

  const { data: site } = await admin.from('sites').select('company_name').eq('account_id', req.account_id).maybeSingle();
  const businessName = site?.company_name || 'your contractor';

  // The refund policy shown below used to be a hardcoded paragraph reciting the
  // DEFAULT tiers. An account running 0/0/0/0 therefore promised this customer a
  // three-quarters refund for cancelling before the tech set off, and then
  // refunded nothing — computeCustomerRefundPercent reads the account's tiers,
  // and the page did not. So read them here too, and render the sentences from
  // the same numbers the refund will use. loadRefundTiers is its own query and
  // swallows its own error, so a pre-migration account (no
  // extra_stop_refund_tiers column yet) falls back to the built-in defaults
  // rather than taking the customer's status page down.
  const refundPolicy = renderRefundPolicy(await loadRefundTiers(admin, req.account_id));
  const status = req.status as QuickStopStatus;
  const when = req.arrival_date ? `${req.arrival_date}${req.arrival_start ? `, ${fmtTime(req.arrival_start)}–${fmtTime(req.arrival_end)}` : ''}` : null;

  const endMs = req.arrival_date && req.arrival_end ? new Date(`${req.arrival_date}T${req.arrival_end}`).getTime() : NaN;
  const canReportNoShow = ['confirmed', 'en_route'].includes(status) && !req.arrived_at && (!Number.isFinite(endMs) || Date.now() <= endMs + 2 * 60 * 60 * 1000);
  const canCancel = ['awaiting_customer_payment', 'confirmed', 'en_route'].includes(status);

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{businessName} · Quick Stop</p>
          <h1 className="workspace-title">{QUICK_STOP_STATUS_LABEL[status]}</h1>
          {when ? <p className="workspace-lead">Arrival window: {when}.</p> : <p className="workspace-lead">We’ll text you as soon as there’s an update.</p>}
        </div>
      </section>

      {searchParams.done === 'canceled' ? <section className="panel workspace-section-card"><p className="payment-banner success">Your Quick Stop was canceled. Any refund due has been issued.</p></section> : null}
      {searchParams.done === 'no_show' ? <section className="panel workspace-section-card"><p className="payment-banner success">Thanks — we’ve recorded the no-show and issued a full refund.</p></section> : null}
      {searchParams.done === 'window_accepted' ? <section className="panel workspace-section-card"><p className="payment-banner success">New arrival window confirmed.</p></section> : null}
      {searchParams.done === 'window_declined' ? <section className="panel workspace-section-card"><p className="payment-banner muted">No problem — your original arrival window still stands.</p></section> : null}
      {searchParams.done === 'diag_approved' ? <section className="panel workspace-section-card"><p className="payment-banner success">Diagnostic visit approved. If there’s an additional charge, we’ve texted you a payment link.</p></section> : null}
      {searchParams.done === 'diag_declined' ? <section className="panel workspace-section-card"><p className="payment-banner muted">Understood — your Quick Stop continues as booked.</p></section> : null}
      {searchParams.error === 'state' ? <section className="panel workspace-section-card"><p className="payment-banner warning">That action isn’t available for this Quick Stop anymore.</p></section> : null}
      {searchParams.error === 'late' ? <section className="panel workspace-section-card"><p className="payment-banner warning">The 2-hour window to report a no-show has passed. Please contact your card issuer or Stripe for help.</p></section> : null}

      {req.proposed_arrival_date && ['confirmed', 'en_route'].includes(status) ? (
        <section className="panel workspace-section-card" style={{ borderColor: 'rgba(255,209,102,.4)' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Action needed</p>
            <h2>New arrival window proposed</h2>
          </div>
          <p className="workspace-details-copy" style={{ marginTop: '.5rem' }}>
            {businessName} would like to move your arrival window to <strong>{req.proposed_arrival_date}, {fmtTime(req.proposed_arrival_start)}–{fmtTime(req.proposed_arrival_end)}</strong>. Your original window stays in place unless you accept.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
            <form action={acceptRevisedWindowQuickStopAction.bind(null, req.id)}><button type="submit" className="btn primary">Accept new window</button></form>
            <form action={declineRevisedWindowQuickStopAction.bind(null, req.id)}><button type="submit" className="btn secondary">Keep original</button></form>
          </div>
        </section>
      ) : null}

      {req.diagnostic_conversion === 'proposed' ? (
        <section className="panel workspace-section-card" style={{ borderColor: 'rgba(255,209,102,.4)' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Action needed</p>
            <h2>Diagnostic visit suggested</h2>
          </div>
          <p className="workspace-details-copy" style={{ marginTop: '.5rem' }}>
            {businessName} recommends turning this into a diagnostic visit{req.diagnostic_proposed_cents ? <> for <strong>{money(req.diagnostic_proposed_cents)}</strong> total</> : null}. Your Quick Stop fee{req.fee_cents ? <> of {money(req.fee_cents)}</> : null} applies as a deposit — you’d only pay the difference.
          </p>
          {req.diagnostic_note ? <p className="job-meta" style={{ marginTop: '.5rem' }}>“{req.diagnostic_note}”</p> : null}
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
            <form action={approveDiagnosticConversionAction.bind(null, req.id)}><button type="submit" className="btn primary">Approve diagnostic</button></form>
            <form action={declineDiagnosticConversionAction.bind(null, req.id)}><button type="submit" className="btn secondary">No thanks</button></form>
          </div>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Details</p>
          <h2>Your Quick Stop</h2>
        </div>
        <div className="form-grid" style={{ marginTop: '.75rem' }}>
          <div className="field"><label>Job</label><p className="job-meta" style={{ margin: 0 }}>{req.ai_summary || 'Quick visit'}</p></div>
          {/* NAMED, and told what it does not cover. This screen is where a
              homeowner checks what they paid for, and "Quick Stop fee · $145"
              beside the job description reads as the price of the job. */}
          <div className="field">
            <label>Priority visit fee</label>
            <p className="job-meta" style={{ margin: 0 }}>{money(req.fee_cents)}{req.diagnostic_fee_cents ? ` + ${money(req.diagnostic_fee_cents)} diagnostic` : ''}</p>
          </div>
          <div className="field">
            <label>Service work</label>
            <p className="job-meta" style={{ margin: 0 }}>Priced and charged separately</p>
          </div>
          {req.refund_cents ? <div className="field"><label>Refunded</label><p className="job-meta" style={{ margin: 0 }}>{money(req.refund_cents)}</p></div> : null}
        </div>

        {canCancel || canReportNoShow ? (
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {canCancel ? (
              <form action={customerCancelQuickStopAction.bind(null, req.id)}>
                <button type="submit" className="btn secondary">Cancel this Quick Stop</button>
              </form>
            ) : null}
            {canReportNoShow ? (
              <form action={reportNoShowQuickStopAction.bind(null, req.id)}>
                <button type="submit" className="btn secondary">Report a no-show</button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="quick-stop-policy">
          <p className="quick-stop-policy-title">Cancellations and refunds</p>
          <ul className="job-meta">
            {refundPolicy.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
