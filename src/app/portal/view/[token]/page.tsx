import Link from 'next/link';
import { createAdminClient } from '@/lib/auth';
// EXACT, not the rounding formatMoney. Every figure on this page is a debt or a
// receipt somebody reconciles against their own bank statement, and the invoice
// page one click away has always shown cents -- so a rounded balance here meant
// two different numbers for one debt on consecutive screens, the first of them
// on a button that says Pay.
import { formatMoneyExact as formatMoney } from '@/lib/jobs';
import { resolvePortalAccess } from '@/lib/client-portal';
import { loadPortal } from '@/lib/client-portal-data';
import { generateReferralCode, buildReferralShareText } from '@/lib/referrals';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';
import { PortalMessageForm } from './PortalMessageForm';
import MailIcon from '@/components/MailIcon';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { customerTogglePlanAction } from './actions';

export const dynamic = 'force-dynamic';
// Never indexed. A live portal link in a search result is somebody's home
// improvement history in a search result.
export const metadata = { title: 'Your Customer Portal', robots: { index: false, follow: false } };

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'Being quoted',
  in_progress: 'In progress',
  complete: 'Finished',
};

function formatDay(value: string | null): string {
  if (!value) return '';
  // Date-only strings are parsed as LOCAL, never through `new Date('Y-M-D')` —
  // that is UTC, and lands a day early for everyone west of Greenwich.
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function PortalViewPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, params.token);
  const portal = access ? await loadPortal(admin, access.accountId, access.clientId) : null;

  if (!portal) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero workspace-hero-solo">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Your account portal</p>
            <h1 className="workspace-title">This link has expired</h1>
            {/* Says nothing about whether it was ever valid or whose it was. */}
            <p className="workspace-lead">
              Links last 90 days. Ask your contractor for a fresh one, or request a new link from their website.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const firstName = portal.clientName.trim().split(/\s+/)[0] || 'there';
  const { brand } = portal;
  const referralCode = generateReferralCode(portal.clientName);
  const shareUrl = brand.siteUrl ? `${brand.siteUrl}?ref=${referralCode}` : `https://letsgetquoted.com?ref=${referralCode}`;
  const shareText = buildReferralShareText({ referrerName: firstName, businessName: portal.businessName, shareUrl });

  // Invoices needing payment
  const openInvoices = portal.invoices.filter((invoice) => invoice.due > 0 && invoice.status !== 'void');
  const settledInvoices = portal.invoices.filter((invoice) => !openInvoices.includes(invoice));

  // Quotes awaiting approval or active
  const pendingQuotes = portal.quotes.filter((q) => !q.approved && q.status === 'new_lead');
  const otherQuotes = portal.quotes.filter((q) => !pendingQuotes.includes(q));

  // Active service/maintenance plans
  const activePlans = portal.plans.filter((p) => p.status === 'active');
  const pastPlans = portal.plans.filter((p) => p.status !== 'active');

  return (
    <>
      <ContractorBrandBar brand={brand} context="Customer Portal" />
      <main className="wide-shell workspace-shell payment-shell portal-home">
        {/* Hero & Account Overview */}
        <section className="workspace-hero panel payment-hero workspace-hero-solo">
          <div className="workspace-hero-copy">
            <h1 className="workspace-title">Hello {firstName}</h1>
            <p className="workspace-lead">
              {portal.totalJobs === 0
                ? `Welcome to your account with ${portal.businessName}.`
                : `${portal.totalJobs} project${portal.totalJobs === 1 ? '' : 's'} with ${portal.businessName}${
                    portal.firstJobAt ? `, customer since ${formatDay(portal.firstJobAt)}` : ''
                  }.`}
            </p>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.9rem', marginBottom: '0.9rem' }}>
              {portal.outstanding > 0 ? (
                <div className="payment-amount-block" style={{ margin: 0, padding: '0.55rem 0.9rem' }}>
                  <span className="payment-amount-label">
                    Balance due{openInvoices.length > 1 ? ` · ${openInvoices.length} invoices` : ''}
                  </span>
                  <strong className="payment-amount" style={{ fontSize: '1.25rem' }}>{formatMoney(portal.outstanding)}</strong>
                </div>
              ) : null}

              {pendingQuotes.length > 0 ? (
                <div style={{ background: 'rgba(255, 179, 122, 0.15)', border: '1px solid var(--ink-amber-3, #f59e0b)', padding: '0.55rem 0.9rem', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quotes to Review</span>
                  <strong style={{ fontSize: '1.15rem', color: '#92400e' }}>{pendingQuotes.length} pending</strong>
                </div>
              ) : null}

              {activePlans.length > 0 ? (
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', padding: '0.55rem 0.9rem', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Service Plans</span>
                  <strong style={{ fontSize: '1.15rem', color: '#065f46' }}>{activePlans.length} active</strong>
                </div>
              ) : null}
            </div>

            <div className="actions workspace-actions portal-home-actions">
              {brand.bookingPath ? (
                <Link className="btn primary" href={brand.bookingPath}>
                  📅 Request new service
                </Link>
              ) : brand.phone ? (
                <a className="btn primary" href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`}>
                  📞 Call {portal.businessName}
                </a>
              ) : null}

              {portal.outstanding > 0 && openInvoices[0] ? (
                <Link className="btn secondary" href={`/invoice/${openInvoices[0].id}`}>
                  📄 Review &amp; Pay Invoice ({formatMoney(openInvoices[0].due)})
                </Link>
              ) : null}

              <a className="btn secondary" href="#portal-message-section">
                <MailIcon /> Send a message
              </a>
            </div>
          </div>
        </section>

        {/* VIP Service-Club Membership Card */}
        {portal.membership ? (
          <section className="panel workspace-section-card" style={{ borderLeft: `4px solid ${portal.membership.badgeColor || '#38bdf8'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div>
                <span style={{ display: 'inline-block', background: portal.membership.badgeColor || '#38bdf8', color: '#0f172a', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.2rem 0.6rem', borderRadius: '4px', marginBottom: '0.3rem' }}>
                  VIP Club Member
                </span>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{portal.membership.tierName}</h2>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--mute-t50, #64748b)', fontSize: '0.88rem' }}>
                  Your active club status includes exclusive member rates, priority queue, and seasonal tune-ups.
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--mute-t50, #64748b)', fontWeight: 600 }}>ESTIMATED ANNUAL VALUE</span>
                <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                  +${portal.membership.annualSavingsEstimate}/yr
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.7rem', marginTop: '1rem' }}>
              <div style={{ padding: '0.75rem 0.9rem', borderRadius: '8px', background: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--edge-t12, #e2e8f0)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369a1', display: 'block' }}>REPAIR DISCOUNT</span>
                <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{portal.membership.discountPercentage}% Off All Work</strong>
              </div>

              <div style={{ padding: '0.75rem 0.9rem', borderRadius: '8px', background: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--edge-t12, #e2e8f0)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369a1', display: 'block' }}>INCLUDED TUNE-UPS</span>
                <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                  {portal.membership.tuneupsRemainingThisYear} of {portal.membership.includedTuneupsPerYear} remaining
                </strong>
              </div>

              <div style={{ padding: '0.75rem 0.9rem', borderRadius: '8px', background: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--edge-t12, #e2e8f0)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369a1', display: 'block' }}>DISPATCH &amp; WARRANTY</span>
                <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                  {portal.membership.emergencyFeeWaived ? 'Waived Dispatch' : 'Priority Queue'} · {portal.membership.warrantyMultiplier}x Warranty
                </strong>
              </div>
            </div>

            {brand.phone && portal.membership.isEligibleForFreeTuneup ? (
              <div style={{ marginTop: '0.9rem' }}>
                <a
                  href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${portal.businessName}, I would like to schedule my included seasonal tune-up under my ${portal.membership.tierName}.`)}`}
                  className="btn primary"
                  style={{ fontSize: '0.85rem' }}
                >
                  📅 Book Included Seasonal Tune-Up
                </a>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 1. Open Invoices (High Priority) */}
        {openInvoices.length > 0 ? (
          <section className="panel workspace-section-card client-attention-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Needs paying</p>
              <h2>Open invoices</h2>
            </div>
            <div className="cost-list">
              {openInvoices.map((invoice) => (
                <Link href={`/invoice/${invoice.id}`} className="cost-item client-attention-link" key={invoice.id}>
                  <div className="cost-item-main">
                    <span className="cost-item-desc">{invoice.jobScope || invoice.ref}</span>
                    <span className="cost-item-sub">
                      {invoice.ref}
                      {invoice.paid > 0 ? ` · ${formatMoney(invoice.paid)} of ${formatMoney(invoice.total)} paid` : ''}
                      {invoice.createdAt ? ` · ${formatDay(invoice.createdAt)}` : ''}
                    </span>
                  </div>
                  <span className="client-attention-pay-block">
                    <span className="cost-item-amount">{formatMoney(invoice.due)}</span>
                    <span className="client-attention-action">{invoice.processing ? 'Processing' : 'Review & pay'}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* 2. Quotes & Estimates Management */}
        {portal.quotes.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Quotes & Proposals</p>
              <h2>Your project quotes</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
              {portal.quotes.map((quote) => (
                <article
                  key={quote.id}
                  style={{
                    padding: '1.1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--edge-t16, #cbd5e1)',
                    background: quote.approved ? 'var(--surface-color, #ffffff)' : 'rgba(var(--tint, 59, 130, 246), 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: '1.05rem' }}>{quote.scope || quote.ref}</strong>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: quote.approved ? '#dcfce7' : '#fef3c7', color: quote.approved ? '#166534' : '#92400e', fontWeight: 600 }}>
                        {quote.statusLabel}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1.15rem' }}>{formatMoney(quote.quotedAmount)}</strong>
                  </div>

                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--mute-t50, #64748b)' }}>
                    {quote.ref} {quote.address ? ` · ${quote.address}` : ''} {quote.scheduledFor ? ` · Scheduled ${formatDay(quote.scheduledFor)}` : ` · Created ${formatDay(quote.createdAt)}`}
                  </p>

                  {quote.depositAmount && !quote.approved ? (
                    <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(255, 179, 122, 0.15)', fontSize: '0.84rem', color: '#92400e' }}>
                      ⚡ <strong>Deposit Required:</strong> {formatMoney(quote.depositAmount)} ({quote.depositPercent}% to lock in schedule).
                    </div>
                  ) : null}

                  {quote.items.length > 0 ? (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--edge-t12, #e2e8f0)', paddingTop: '0.6rem' }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mute-t50, #64748b)', margin: '0 0 0.4rem' }}>
                        Itemized Scope Breakdown ({quote.items.length} line items)
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {quote.items.map((item) => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', gap: '0.5rem' }}>
                            <span>
                              {item.kind === 'addon' ? '➕ ' : item.kind === 'subscription' ? '🔄 ' : '✓ '}
                              {item.label}
                              {item.recommended ? (
                                <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600 }}>
                                  Recommended
                                </span>
                              ) : null}
                              {item.kind === 'addon' && !item.selected ? (
                                <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                                  (Optional)
                                </span>
                              ) : null}
                            </span>
                            <span style={{ fontWeight: 600 }}>{formatMoney(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {brand.phone ? (
                      <a
                        href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${portal.businessName}, regarding quote ${quote.ref}: `)}`}
                        className="btn secondary"
                        style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                      >
                        💬 Text about this quote
                      </a>
                    ) : null}
                    <a
                      href="#portal-message-section"
                      className="btn secondary"
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <MailIcon /> Ask question
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* 3. Service & Maintenance Plans Management */}
        {portal.plans.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Ongoing Coverage</p>
              <h2>Service & maintenance plans</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.75rem' }}>
              {portal.plans.map((plan) => (
                <article
                  key={plan.id}
                  style={{
                    padding: '1rem 1.1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--edge-t16, #cbd5e1)',
                    background: plan.status === 'active' ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-color, #ffffff)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: '1.02rem' }}>{plan.title}</strong>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.76rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: plan.status === 'active' ? '#dcfce7' : '#f1f5f9', color: plan.status === 'active' ? '#166534' : '#475569', fontWeight: 600 }}>
                        {plan.statusLabel}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1.1rem' }}>
                      {formatMoney(plan.amount)} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--mute-t50)' }}>/ {plan.frequencyLabel.toLowerCase()}</span>
                    </strong>
                  </div>

                  {plan.scope ? (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                      <strong>Service Scope:</strong> {plan.scope}
                    </p>
                  ) : null}

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--mute-t50, #64748b)' }}>
                    {plan.nextRunDate ? <span>📅 Next service: <strong>{formatDay(plan.nextRunDate)}</strong></span> : null}
                    {plan.paymentMethodSummary ? <span>💳 Auto-pay: <strong>{plan.paymentMethodSummary}</strong></span> : plan.autoCharge ? <span>💳 Auto-charge enabled</span> : null}
                    {plan.remainingCycles !== null ? <span>🔄 {plan.remainingCycles} visits remaining</span> : null}
                    {plan.totalCycles ? <span>🔢 {plan.totalCycles} total installments</span> : null}
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {brand.phone ? (
                      <a
                        href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${portal.businessName}, regarding my service plan (${plan.title}): `)}`}
                        className="btn secondary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                      >
                        🔧 Request Plan Service Visit
                      </a>
                    ) : null}

                    {plan.kind === 'recurring_service' ? (
                      plan.status === 'active' ? (
                        <ConfirmActionButton
                          action={customerTogglePlanAction.bind(null, params.token, plan.id, false)}
                          confirmMessage={`Are you sure you want to pause your ${plan.title}? Any upcoming visits will be removed from the schedule.`}
                          className="btn secondary"
                          pendingLabel="Pausing…"
                          savedLabel="Paused ✓"
                        >
                          <span style={{ fontSize: '0.8rem' }}>⏸ Pause plan</span>
                        </ConfirmActionButton>
                      ) : (
                        <ConfirmActionButton
                          action={customerTogglePlanAction.bind(null, params.token, plan.id, true)}
                          confirmMessage={`Resume your ${plan.title}? Future visits will be scheduled starting from the next upcoming date.`}
                          className="btn primary"
                          pendingLabel="Resuming…"
                          savedLabel="Resumed ✓"
                        >
                          <span style={{ fontSize: '0.8rem' }}>▶ Resume plan</span>
                        </ConfirmActionButton>
                      )
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* Durable Property & Equipment Passport */}
        {portal.propertyPassports && portal.propertyPassports.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Durable Home Passport</p>
              <h2>Mechanical systems &amp; property records</h2>
            </div>

            {portal.propertyPassports.map((passport) => (
              <div key={passport.id} style={{ marginTop: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', padding: '0.75rem 1rem', background: 'var(--surface-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--edge-t12, #e2e8f0)', marginBottom: '0.85rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Passport ID: {passport.passportCode}
                    </span>
                    <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>{passport.address}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Home Health:</span>
                    <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', background: passport.healthScore.score >= 80 ? '#ecfdf5' : '#fffbeb', color: passport.healthScore.score >= 80 ? '#065f46' : '#b45309', fontWeight: 800, fontSize: '0.85rem', border: '1px solid currentColor' }}>
                      {passport.healthScore.grade} ({passport.healthScore.score}/100)
                    </span>
                  </div>
                </div>

                {passport.equipment.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {passport.equipment.map((eq) => (
                      <div key={eq.id} style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--edge-t16, #cbd5e1)', background: 'var(--surface-color, #fff)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.4rem' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem' }}>
                            <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{eq.name}</strong>
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                              {eq.condition}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                            {eq.brand ? <div>Brand: <strong>{eq.brand}</strong></div> : null}
                            {eq.modelNumber ? <div>Model: {eq.modelNumber}</div> : null}
                            {eq.serialNumber ? <div>Serial: {eq.serialNumber}</div> : null}
                            {eq.specs?.filterSize ? (
                              <div style={{ color: '#0369a1', fontWeight: 600, marginTop: '0.2rem' }}>
                                🔍 Filter Spec: {eq.specs.filterSize}
                              </div>
                            ) : null}
                            <div style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>
                              Installed {eq.installedOn} (approx. {eq.estimatedAgeYears} yrs old)
                            </div>
                          </div>
                        </div>

                        {brand.phone ? (
                          <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                            <a
                              href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${portal.businessName}, I would like to schedule service/filter replacement for my ${eq.name} at ${passport.address}.`)}`}
                              className="btn secondary"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', width: '100%', textAlign: 'center' }}
                            >
                              🔧 Request Unit Service
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Passport record active. Installed equipment details will appear as work is completed.</p>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {/* 4. Active & Past Work History */}
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Work history</p>
            <h2>Everything we&apos;ve done</h2>
          </div>
          {portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : (
            <ul className="portal-job-list portal-history">
              {portal.jobs.map((job) => (
                <li key={job.id} className={`portal-job status-${job.status}`}>
                  <div className="portal-job-main">
                    <strong>{job.scope || job.ref || 'Work'}</strong>
                    <span className="portal-job-meta">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.completedAt ? ` · finished ${formatDay(job.completedAt)}` : job.scheduledFor ? ` · ${formatDay(job.scheduledFor)}` : ''}
                      {job.address ? ` · ${job.address}` : ''}
                    </span>
                  </div>
                  {job.quotedAmount > 0 ? <span className="portal-job-amount">{formatMoney(job.quotedAmount)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 5. Document & Media Vault */}
        {portal.documents.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Document & Media Vault</p>
              <h2>Project records, proof & certificates</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.8rem', marginTop: '0.8rem' }}>
              {portal.documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--edge-t16, #cbd5e1)',
                    background: 'var(--surface-color, #ffffff)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute-t50, #64748b)', fontWeight: 600 }}>
                        {doc.kindLabel}
                      </span>
                      {doc.badge ? (
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontWeight: 600 }}>
                          {doc.badge}
                        </span>
                      ) : null}
                    </div>
                    <strong style={{ fontSize: '0.88rem', display: 'block', lineHeight: 1.35 }}>
                      {doc.title}
                    </strong>
                    {doc.jobScope || doc.jobRef ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--mute-t50, #64748b)' }}>
                        {doc.jobScope || doc.jobRef}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--mute-t50, #64748b)' }}>{formatDay(doc.createdAt)}</span>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target={doc.url.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer"
                        className="btn secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                      >
                        📄 View
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 6. Conversation & Direct Message Center */}
        <section id="portal-message-section" className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Communication Center</p>
            <h2>Messages with {portal.businessName}</h2>
          </div>

          {portal.messages.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', margin: '0.75rem 0 1.25rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {portal.messages.slice(0, 15).map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.direction === 'inbound' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '12px',
                    background: msg.direction === 'inbound' ? 'var(--primary-color, #2563eb)' : 'var(--surface-subtle, #f1f5f9)',
                    color: msg.direction === 'inbound' ? '#ffffff' : 'inherit',
                    fontSize: '0.88rem',
                    lineHeight: 1.45,
                    border: msg.direction === 'inbound' ? 'none' : '1px solid var(--edge-t12, #e2e8f0)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', fontSize: '0.72rem', opacity: 0.85, marginBottom: '0.2rem' }}>
                    <span>{msg.sender}</span>
                    <span>{formatDay(msg.createdAt)}</span>
                  </div>
                  <div>{msg.body}</div>
                  {msg.mediaUrls && msg.mediaUrls.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {msg.mediaUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', textDecoration: 'underline' }}>
                          📷 Attachment #{i + 1}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state" style={{ margin: '0.5rem 0 1rem' }}>No message history yet. Write to {portal.businessName} below anytime.</p>
          )}

          <div style={{ borderTop: '1px solid var(--edge-t12, #e2e8f0)', paddingTop: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
              Ask a question or request service
            </p>
            <PortalMessageForm
              token={params.token}
              businessName={portal.businessName}
              jobs={portal.jobs.map((j) => ({ id: j.id, ref: j.ref, scope: j.scope }))}
            />
          </div>
        </section>

        {/* 7. Warranties & Coverage */}
        {portal.warranties.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Still covered</p>
              <h2>Your warranties</h2>
            </div>
            <div className="client-warranty-list">
              {portal.warranties.map((warranty) => (
                <article key={warranty.id} className={`client-warranty status-${warranty.status}`}>
                  <div className="client-warranty-head">
                    <strong>{warranty.title}</strong>
                    <span className="client-warranty-status">{warranty.statusLabel}</span>
                  </div>
                  <p className="client-warranty-dates">
                    From {warranty.startsOn}
                    {warranty.endsOn ? ` to ${warranty.endsOn}` : ''} · {warranty.remainingLabel}
                  </p>
                  {warranty.covers ? (
                    <p className="client-warranty-covers"><strong>Covered:</strong> {warranty.covers}</p>
                  ) : null}
                  {warranty.excludes ? (
                    <p className="client-warranty-excludes"><strong>Not covered:</strong> {warranty.excludes}</p>
                  ) : null}
                  {warranty.maintenanceNotes ? (
                    <p className="client-warranty-maintenance"><strong>Maintenance specs:</strong> {warranty.maintenanceNotes}</p>
                  ) : null}
                  {warranty.serviceDueLabel ? <p className="client-warranty-service">{warranty.serviceDueLabel}</p> : null}
                  {brand.phone ? (
                    <div style={{ marginTop: '0.6rem' }}>
                      <a
                        href={`sms:${brand.phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${portal.businessName}, I'd like to schedule routine maintenance for my ${warranty.title}.`)}`}
                        className="btn secondary"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                      >
                        🔧 Request Routine Service
                      </a>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <p className="portal-note">
              Something gone wrong? Write to {portal.businessName} above or request maintenance anytime.
            </p>
          </section>
        ) : null}

        {/* 8. Payment Receipts & Settled Bills */}
        {portal.payments.length > 0 || settledInvoices.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Receipts</p>
              <h2>What you&apos;ve paid</h2>
            </div>
            {portal.payments.length > 0 ? (
              <ul className="portal-job-list portal-receipts">
                {portal.payments.map((payment) => (
                  <li key={payment.id} className="portal-job portal-receipt">
                    <div className="portal-job-main">
                      <strong>{payment.label}</strong>
                      <span className="portal-job-meta">
                        {payment.paidAt ? `Paid ${formatDay(payment.paidAt)}` : 'Paid'}
                        {payment.refunded ? ' · partially refunded' : ''}
                      </span>
                    </div>
                    <span className="portal-job-amount">{formatMoney(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {settledInvoices.length > 0 ? (
              <div className="cost-list portal-settled">
                {settledInvoices.map((invoice) => (
                  <Link href={`/invoice/${invoice.id}`} className="cost-item" key={invoice.id}>
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{invoice.jobScope || invoice.ref}</span>
                      <span className="cost-item-sub">
                        {invoice.ref} · {invoice.statusLabel}
                      </span>
                    </div>
                    <span className="cost-item-amount">{formatMoney(invoice.total)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* 9. Referral Rewards */}
        <section className="panel workspace-section-card referral-share-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Rewards</p>
            <h2>Refer a friend or neighbor</h2>
          </div>
          <p className="workspace-lead" style={{ fontSize: '0.95rem', marginBottom: '0.9rem' }}>
            Give a neighbor <strong>$50 off</strong> their first service with {portal.businessName}, and receive a <strong>$50 credit</strong> on your next project when they book!
          </p>
          <div className="referral-code-box" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.9rem', background: 'var(--surface-subtle, rgba(0,0,0,0.03))', borderRadius: '8px', border: '1px solid var(--border-color, rgba(0,0,0,0.08))', marginBottom: '0.9rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Your Promo Code:</span>
            <code style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.05em' }}>{referralCode}</code>
          </div>
          <div className="actions workspace-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <a
              className="btn primary"
              href={`sms:?&body=${encodeURIComponent(shareText)}`}
            >
              💬 Text to a neighbor
            </a>
            <a
              className="btn secondary"
              href={`mailto:?subject=${encodeURIComponent(`$50 off with ${portal.businessName}`)}&body=${encodeURIComponent(shareText)}`}
            >
              <MailIcon /> Email link
            </a>
          </div>
        </section>

        <p className="portal-foot">
          This page only shows your own records with {portal.businessName}. Don&apos;t forward the link — anyone who has
          it can see this.
        </p>
        <ContractorBrandFoot businessName={portal.businessName} />
      </main>
    </>
  );
}
