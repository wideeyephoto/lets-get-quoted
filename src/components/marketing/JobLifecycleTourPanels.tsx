'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { DEMO_TOUR_CONTRACTOR as company, DEMO_TOUR_CUSTOMER as customer, DEMO_TOUR_JOB as job } from '@/lib/demo-tour-data';
import { jobTourHref, jobTourTotals } from '@/lib/job-lifecycle-tour';
import { APP_SIGNUP_URL, DEMO_URL } from './links';
import type { TourPanelProps } from './JobLifecycleTour';
import styles from './job-lifecycle-tour.module.css';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

function QuoteItems() {
  return <dl className={styles.items}>{job.lineItems.map((item) => <div key={item.id}><dt>{item.title}</dt><dd>{money(item.amount)}</dd></div>)}</dl>;
}

function Upgrade({ state, update }: TourPanelProps) {
  const upgrade = job.optionalUpgrades[0];
  return <label className={styles.upgrade}><input type="checkbox" checked={state.upgradeSelected} onChange={(event) => update({ upgradeSelected: event.target.checked }, 'quote_option_changed')} /><span><strong>{upgrade.title}</strong><small>Optional · {money(upgrade.amount)} · Changing this option resets approval.</small></span></label>;
}

function PhoneHandoff({ upgradeSelected }: { upgradeSelected: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${jobTourHref('approve', upgradeSelected)}`;
  useEffect(() => {
    let cancelled = false;
    setQr(null);
    setFailed(false);
    import('qrcode').then((module) => module.default.toDataURL(url, { width: 180, margin: 2 })).then((data) => { if (!cancelled) setQr(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url, attempt]);
  return <div className={styles.handoff}>
    {qr ? <Image src={qr} alt="Scan to try the sample customer approval on your phone" width={150} height={150} unoptimized /> : <p role="status">{failed ? 'QR code unavailable.' : 'Creating QR code…'}</p>}
    <div><p>The quote option carries over. Signature and payment start fresh.</p><a href={url} target="_blank" rel="noopener noreferrer">Open the sample customer view ↗</a>{failed && <button type="button" className={styles.textButton} onClick={() => setAttempt((value) => value + 1)}>Retry QR code</button>}</div>
  </div>;
}

export default function JobLifecycleTourPanels(props: TourPanelProps) {
  const { state, update, goTo } = props;
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const totals = jobTourTotals(state.upgradeSelected);
  useEffect(() => {
    if (!processing) return;
    const timeout = window.setTimeout(() => {
      update({ depositSimulated: true }, 'deposit_simulated');
      setProcessing(false);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650);
    return () => window.clearTimeout(timeout);
  }, [processing, update]);
  // A changed quote cannot finish an in-flight payment for the earlier price.
  useEffect(() => { if (!state.signed) setProcessing(false); }, [state.signed]);

  if (state.step === 'site') return <article className={styles.website}>
    <div className={styles.browserBar}><span aria-hidden="true">● ● ●</span><span>brokepipes.letsgetquoted.com · Sample</span></div>
    <div className={styles.websiteHeader}><span className={styles.logo} aria-hidden="true">BP</span><strong>{company.name}</strong><small>{company.city}, {company.state}</small></div>
    <div className={styles.websiteHero}><div><span className={styles.eyebrow}>LOCAL PLUMBING · READY TO HELP</span><h3>A leak can’t wait.<br />Neither should you.</h3><p>Tell us what happened. We’ll help you take the next step.</p><button type="button" className={styles.primary} onClick={() => goTo('intake')}>Request an estimate →</button><small>No account needed · Sample request</small></div><div className={styles.pipeVisual} aria-hidden="true"><span>24/7</span><div>EMERGENCY<br />PLUMBING</div><span className={styles.waterDrop}>◈</span></div></div>
    <div className={styles.serviceStrip}><span>Leak repairs</span><span>Supply lines</span><span>Valve replacements</span></div>
    <p className={styles.sampleNote}>Illustrative contractor website · {company.serviceArea}</p>
  </article>;

  if (state.step === 'intake') return <article className={styles.card}>
    <div className={styles.cardTop}><span className={styles.eyebrow}>SMART INTAKE</span><span className={styles.badge}>Sample request</span></div>
    <h3>What can we help with, {customer.name.split(' ')[0]}?</h3>
    <div className={styles.message}><strong>{customer.name}</strong><p>{job.homeownerInquiry}</p></div>
    <dl className={styles.facts}><div><dt>Location</dt><dd>{customer.city}, {customer.zip}</dd></div><div><dt>Timing</dt><dd>{job.urgency}</dd></div></dl>
    {state.intakeAnalyzed ? <div className={styles.success} role="status"><strong>Sample request analyzed</strong><p>Scope captured: supply line leak repair, pressure testing, and insulation. Matched to the {customer.city} service area.</p><p>Preliminary sample range: {money(totals.subtotal)}–{money(totals.subtotal + job.upgradeTotal)}. The contractor reviews and sets the final quote.</p><button className={styles.primary} type="button" onClick={() => goTo('lead')}>See the qualified lead →</button></div> : <button type="button" className={styles.primary} onClick={() => update({ intakeAnalyzed: true }, 'action_simulated')}>Analyze sample request →</button>}
  </article>;

  if (state.step === 'lead') return <article className={styles.card}>
    <div className={styles.cardTop}><span className={styles.eyebrow}>PRIORITY INBOX · {job.leadId}</span><span className={styles.badge}>Sample lead</span></div>
    <div className={styles.leadHeadline}><div><h3>{customer.name}</h3><p>{job.category} · {customer.city}</p></div><div className={styles.score}><strong>{job.leadScore}</strong><span>/ 100 fit score</span></div></div>
    <div className={styles.message}><strong>{job.leadScoreLabel}</strong><p>{job.leadFitReason}</p></div>
    <dl className={styles.facts}><div><dt>Route fit</dt><dd>{job.distanceMiles} miles away</dd></div><div><dt>Requested timing</dt><dd>{job.timeline}</dd></div><div><dt>Customer</dt><dd>{customer.name}</dd></div><div><dt>Scope</dt><dd>Repair · pressure test · insulation</dd></div></dl>
    <details className={styles.details}><summary>Read the original request</summary><p>{job.homeownerInquiry}</p></details>
    <button type="button" className={styles.primary} onClick={() => goTo('quote')}>Build the sample quote →</button>
  </article>;

  if (state.step === 'quote') return <article className={styles.card}>
    <div className={styles.cardTop}><span className={styles.eyebrow}>QUOTE BUILDER · {job.quoteId}</span><span className={styles.badge}>{state.quoteSent ? 'Send simulated' : 'Draft sample'}</span></div>
    <h3>{job.title}</h3><p className={styles.meta}>Prepared for {customer.name} · {company.name}</p>
    <QuoteItems /><Upgrade {...props} />
    <dl className={styles.totals}><div><dt>Quote total</dt><dd>{money(totals.total)}</dd></div><div><dt>Deposit required</dt><dd>{money(totals.deposit)}</dd></div></dl>
    <div className={styles.actions}><button type="button" className={styles.primary} disabled={state.quoteSent} onClick={() => update({ quoteSent: true }, 'action_simulated')}>{state.quoteSent ? '✓ Send simulated' : 'Simulate sending quote'}</button><button type="button" className={styles.textButton} onClick={() => goTo('approve')}>Review as homeowner →</button></div>
    {state.quoteSent && <p role="status" className={styles.sampleNote}>Sample delivery preview ready for {customer.name}. No message was sent.</p>}
    <details className={styles.details} onToggle={(event) => { const opened = event.currentTarget.open; setHandoffOpen(opened); if (opened) update({}, 'cross_device_handoff_opened'); }}><summary>Try the customer view on your phone</summary>{handoffOpen && <PhoneHandoff upgradeSelected={state.upgradeSelected} />}</details>
  </article>;

  return <article className={`${styles.card} ${styles.approval}`}>
    <div className={styles.cardTop}><span className={styles.eyebrow}>CUSTOMER PORTAL · {job.quoteId}</span><span className={styles.badge}>{state.booked ? 'Sample booked' : 'Approval preview'}</span></div>
    <h3>{company.name}</h3><p className={styles.meta}>Prepared for {customer.name} · {job.title}</p>
    <details className={styles.details}><summary>Review itemized scope</summary><QuoteItems /></details>
    <Upgrade {...props} />
    <dl className={styles.totals}><div><dt>Quote total</dt><dd>{money(totals.total)}</dd></div><div><dt>Sample deposit</dt><dd>{money(totals.deposit)}</dd></div></dl>
    <div className={styles.approvalSteps}>
      <div><span className={styles.stepNumber}>1</span><div><strong>Approve with a sample signature</strong>{state.signed ? <p className={styles.signature} role="status">{customer.name} <small>· Sample signature applied</small></p> : <button type="button" className={styles.secondary} onClick={() => update({ signed: true }, 'signature_applied')}>Apply sample signature</button>}</div></div>
      <div><span className={styles.stepNumber}>2</span><div><strong>Simulate the {money(totals.deposit)} deposit</strong>{state.depositSimulated ? <p className={styles.confirmation} role="status">✓ Deposit simulated. No payment taken.</p> : <><button type="button" className={styles.primary} disabled={!state.signed || processing} onClick={() => setProcessing(true)}>{processing ? 'Simulating…' : `Simulate ${money(totals.deposit)} deposit`}</button>{!state.signed && <small>Apply the sample signature first.</small>}</>}</div></div>
      <div><span className={styles.stepNumber}>3</span><div><strong>Confirm the sample arrival</strong><p>{job.scheduledDate} · {job.scheduledArrivalWindow}</p><button type="button" className={styles.secondary} disabled={!state.depositSimulated || state.booked} onClick={() => update({ booked: true }, 'tour_completed')}>{state.booked ? '✓ Sample visit booked' : 'Confirm sample booking'}</button></div></div>
    </div>
    <details className={styles.result} open={state.booked || props.previewResult}><summary>{state.booked ? 'Your sample job is connected' : 'Preview the connected result'}</summary><dl className={styles.facts}><div><dt>Quote value</dt><dd>{money(totals.total)}</dd></div><div><dt>Signature</dt><dd>{state.signed ? 'Sample applied' : 'Not yet applied'}</dd></div><div><dt>Deposit</dt><dd>{state.depositSimulated ? `${money(totals.deposit)} simulated` : 'Not yet simulated'}</dd></div><div><dt>Remaining after deposit</dt><dd>{money(totals.balance)}</dd></div><div><dt>Booking</dt><dd>{state.booked ? 'Confirmed in sample' : 'Preview only'}</dd></div><div><dt>Sample crew</dt><dd>{job.crewAssigned}</dd></div></dl><div className={styles.actions}><a className={styles.primary} href={APP_SIGNUP_URL} onClick={() => update({}, 'signup_clicked')}>Build my free website →</a><a href={DEMO_URL} onClick={() => update({}, 'explore_freely')}>Explore the dashboard</a></div></details>
  </article>;
}
