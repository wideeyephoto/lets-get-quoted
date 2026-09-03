'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CANDIDATE_AI_NOTE,
  CANDIDATE_QUERY_LIMIT,
  quickStopRuleReference,
  type CandidateReport,
} from '@/lib/quick-stop-candidates';
import type { ScreeningSummary } from '@/lib/quick-stop-screenings';
import { quickStopFunnel, quickStopFunnelSentence } from '@/lib/quick-stop-funnel';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';
import MailIcon from '@/components/MailIcon';

const SHOW = 6;

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function dayLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 116 ? `${clean.slice(0, 115)}…` : clean;
}

export type QuickStopResults = {
  totalRequests: number;
  offersSent: number;
  confirmedCount: number;
  conversionRate: number;
  totalRevenueCents: number;
  medianResponseMinutes: number | null;
  avgDetourMiles: number | null;
};

export default function QuickStopCandidates({
  report,
  screenings: _screenings,
  windowDays,
  minFeeCents,
  maxVisitMinutes,
  enabled,
  reachable,
  results,
  businessName = 'Your Business',
  bookingUrl = '',
  daysAhead = 1,
}: {
  report: CandidateReport;
  screenings: ScreeningSummary;
  windowDays: number;
  minFeeCents: number;
  maxVisitMinutes: number;
  enabled: boolean;
  reachable: number;
  results?: QuickStopResults;
  businessName?: string;
  bookingUrl?: string;
  daysAhead?: number;
}) {
  const [pitchOpen, setPitchOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<'sms' | 'email' | null>(null);

  const pitch = buildQuickStopPitch({
    businessName: businessName || 'Your Business',
    bookingUrl: bookingUrl || 'https://letsgetquoted.com',
    minFeeCents,
    daysAhead,
  });

  const handleCopy = async (type: 'sms' | 'email') => {
    try {
      const textToCopy = type === 'sms' ? pitch.sms : `${pitch.subject}\n\n${pitch.body}`;
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        setCopiedType(type);
        setTimeout(() => setCopiedType(null), 3000);
      }
    } catch {
      // Clipboard write failed
    }
  };

  const rules = quickStopRuleReference();
  const funnel = quickStopFunnel(report);
  const count = report.eligible.length;
  const unknown = report.unknownLength.length;
  const floorCents = minFeeCents > 0 ? count * minFeeCents : 0;

  const leftOut: string[] = [];
  if (report.removed.duplicates > 0) {
    leftOut.push(
      report.removed.duplicates === 1
        ? '1 lead that had already become a job'
        : `${report.removed.duplicates} leads that had already become jobs`,
    );
  }
  if (report.removed.alreadyQuickStop > 0) {
    leftOut.push(
      report.removed.alreadyQuickStop === 1
        ? '1 job already booked as a Quick Stop'
        : `${report.removed.alreadyQuickStop} jobs already booked as Quick Stops`,
    );
  }
  if (report.removed.testData > 0) {
    leftOut.push(
      report.removed.testData === 1
        ? '1 record that looks like test data'
        : `${report.removed.testData} records that look like test data`,
    );
  }
  const leftOutNote = leftOut.length > 0 ? <p className="es-demand-more">Left out before counting: {leftOut.join('; ')}.</p> : null;

  const defaultResults: QuickStopResults = results || {
    totalRequests: 0,
    offersSent: 0,
    confirmedCount: 0,
    conversionRate: 0,
    totalRevenueCents: 0,
    medianResponseMinutes: null,
    avgDetourMiles: null,
  };

  if (report.screened === 0) {
    return (
      <div className="qs-insights-container">
        {/* Results Section */}
        <section className="panel workspace-section-card" id="quick-stop-results" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Performance</p>
            <h2>Results &amp; Realized Revenue</h2>
          </div>
          <div className="qs-results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Requests Received</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.totalRequests}</strong>
            </div>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Offers Sent</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.offersSent}</strong>
            </div>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(52, 199, 123, 0.08)', border: '1px solid rgba(52, 199, 123, 0.25)' }}>
              <span style={{ fontSize: '0.75rem', color: '#34c77b', display: 'block' }}>Paid Conversion</span>
              <strong style={{ fontSize: '1.25rem', color: '#34c77b' }}>{defaultResults.conversionRate}% <small style={{ fontSize: '0.75rem', fontWeight: 500 }}>({defaultResults.confirmedCount} paid)</small></strong>
            </div>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(255, 122, 33, 0.08)', border: '1px solid rgba(255, 122, 33, 0.25)' }}>
              <span style={{ fontSize: '0.75rem', color: '#ff9a52', display: 'block' }}>Revenue Earned</span>
              <strong style={{ fontSize: '1.25rem', color: '#ff9a52' }}>${Math.round(defaultResults.totalRevenueCents / 100)}</strong>
            </div>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Median Response</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.medianResponseMinutes != null ? `${defaultResults.medianResponseMinutes}m` : '—'}</strong>
            </div>
            <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Avg. Detour</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.avgDetourMiles != null ? `${defaultResults.avgDetourMiles} mi` : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="panel workspace-section-card es-demand" id="quick-stop-demand">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Demand</p>
            <h2>Possibly eligible work</h2>
          </div>
          <p className="empty-state">
            Nothing in the last {windowDays} days to look at yet. As leads and jobs come in, the ones short enough to slot into a day will be listed here.
          </p>
          {leftOutNote}
        </section>
      </div>
    );
  }

  return (
    <div className="qs-insights-container">
      {/* 1. RESULTS SECTION */}
      <section className="panel workspace-section-card" id="quick-stop-results" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Performance</p>
          <h2>Results &amp; Realized Revenue</h2>
        </div>

        <div
          className="qs-results-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.75rem',
          }}
        >
          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Requests Received</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.totalRequests}</strong>
          </div>

          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Offers Sent</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>{defaultResults.offersSent}</strong>
          </div>

          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(52, 199, 123, 0.08)', border: '1px solid rgba(52, 199, 123, 0.25)' }}>
            <span style={{ fontSize: '0.75rem', color: '#34c77b', display: 'block' }}>Paid Conversion</span>
            <strong style={{ fontSize: '1.25rem', color: '#34c77b' }}>
              {defaultResults.conversionRate}% <small style={{ fontSize: '0.75rem', fontWeight: 500 }}>({defaultResults.confirmedCount} paid)</small>
            </strong>
          </div>

          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(255, 122, 33, 0.08)', border: '1px solid rgba(255, 122, 33, 0.25)' }}>
            <span style={{ fontSize: '0.75rem', color: '#ff9a52', display: 'block' }}>Revenue Earned</span>
            <strong style={{ fontSize: '1.25rem', color: '#ff9a52' }}>
              ${Math.round(defaultResults.totalRevenueCents / 100)}
            </strong>
          </div>

          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Median Response</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>
              {defaultResults.medianResponseMinutes != null ? `${defaultResults.medianResponseMinutes}m` : '—'}
            </strong>
          </div>

          <div className="qs-result-card" style={{ padding: '0.85rem', borderRadius: '10px', background: 'rgba(var(--tint, 255,255,255), 0.03)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block' }}>Avg. Detour</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>
              {defaultResults.avgDetourMiles != null ? `${defaultResults.avgDetourMiles} mi` : '—'}
            </strong>
          </div>
        </div>
      </section>

      {/* 2. DEMAND & OPPORTUNITIES SECTION */}
      <section className="panel workspace-section-card es-demand" id="quick-stop-demand">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Demand</p>
          <h2>Possibly eligible work</h2>
        </div>

        <p className="workspace-details-copy es-demand-lede">
          Read {report.screened} of your {CANDIDATE_QUERY_LIMIT} most recent leads and jobs across the last {windowDays} days.
        </p>

        {count > 0 ? (
          <div className="es-demand-headline">
            <h3>{count} × {money(minFeeCents)} = <strong>{money(floorCents)}</strong> in potential visit fees</h3>
            <p className="field-hint">A minimum calculation based on your lowest fee — not money you lost, but work that passed your rules.</p>
          </div>
        ) : null}

        {unknown > 0 ? (
          <div className="es-demand-warn" style={{ marginTop: '0.75rem', marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(255, 209, 102, 0.1)', border: '1px solid rgba(255, 209, 102, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
            <div>
              <strong style={{ color: '#ffd166', fontSize: '0.9rem' }}>
                ⚠️ {unknown} likely-fit {unknown === 1 ? 'job is' : 'jobs are'} missing an estimated duration
              </strong>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Adding duration estimates to past work helps the route engine identify open gaps automatically.
              </p>
            </div>
            <Link href="/dashboard/jobs" className="btn secondary" style={{ minHeight: '38px', fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
              Add duration to jobs →
            </Link>
          </div>
        ) : null}

        {/* Funnel Breakdown */}
        <details className="qs-funnel-details" style={{ marginBottom: '1.25rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--muted)' }}>
            📊 How this demand calculation was broken down
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <ol className="qs-funnel" aria-label={quickStopFunnelSentence(funnel)}>
              {funnel.map((step) => (
                <li key={step.key} className="qs-funnel-step" data-drop={step.isBiggestDrop || undefined}>
                  <div className="qs-funnel-head">
                    <span className="qs-funnel-count">{step.count}</span>
                    <span className="qs-funnel-label">{step.label}</span>
                  </div>
                  {step.detail ? <small className="qs-funnel-desc">{step.detail}</small> : null}
                  {step.action ? (
                    <a href={step.action.href} className="qs-funnel-action" style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>
                      {step.action.label} →
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </details>

        <div className="es-demand-cols">
          <div className="es-demand-col">
            <h3 className="es-demand-col-head is-yes">
              <span aria-hidden="true">✓</span> Possibly eligible
            </h3>
            {report.eligible.length === 0 ? (
              <p className="es-demand-none">No past jobs matched all criteria.</p>
            ) : (
              <ul className="es-demand-list">
                {report.eligible.slice(0, SHOW).map((item) => (
                  <li key={`${item.source}-${item.id}`}>
                    <Link href={item.href} className="es-demand-item">
                      <span className="es-demand-item-top">
                        <strong>{item.clientName}</strong>
                        <span className="es-demand-meta">
                          {item.label} · {dayLabel(item.createdAt)}
                        </span>
                      </span>
                      <span className="es-demand-text">{snippet(item.text)}</span>
                      <span className="es-demand-tag is-yes">
                        ~{item.estimatedHours ? Math.round(item.estimatedHours * 60) : 45}m
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {report.eligible.length > SHOW ? (
              <p className="es-demand-more">+ {report.eligible.length - SHOW} more eligible</p>
            ) : null}
          </div>

          <div className="es-demand-col" id="quick-stop-unknown">
            <h3 className="es-demand-col-head is-unknown">
              <span aria-hidden="true">?</span> No length recorded
            </h3>
            {report.unknownLength.length === 0 ? (
              <p className="es-demand-none">All recent records had recorded lengths.</p>
            ) : (
              <ul className="es-demand-list">
                {report.unknownLength.slice(0, SHOW).map((item) => (
                  <li key={`${item.source}-${item.id}`}>
                    <Link href={item.href} className="es-demand-item">
                      <span className="es-demand-item-top">
                        <strong>{item.clientName}</strong>
                        <span className="es-demand-meta">
                          {item.label} · {dayLabel(item.createdAt)}
                        </span>
                      </span>
                      <span className="es-demand-text">{snippet(item.text)}</span>
                      <span className="es-demand-tag is-unknown">No duration</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {report.unknownLength.length > SHOW ? (
              <p className="es-demand-more">+ {report.unknownLength.length - SHOW} more</p>
            ) : null}
          </div>

          <div className="es-demand-col">
            <h3 className="es-demand-col-head is-no">
              <span aria-hidden="true">✕</span> Wouldn&rsquo;t have
            </h3>
            {report.excluded.length === 0 ? (
              <p className="es-demand-none">Nothing in this window was ruled out.</p>
            ) : (
              <ul className="es-demand-list">
                {report.excluded.slice(0, SHOW).map((item) => (
                  <li key={`${item.source}-${item.id}`}>
                    <Link href={item.href} className="es-demand-item">
                      <span className="es-demand-item-top">
                        <strong>{item.clientName}</strong>
                        <span className="es-demand-meta">
                          {item.label} · {dayLabel(item.createdAt)}
                        </span>
                      </span>
                      <span className="es-demand-text">{snippet(item.text)}</span>
                      <span className={`es-demand-tag ${item.unsafe ? 'is-unsafe' : 'is-no'}`}>
                        {item.blockedBy.join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {report.excluded.length > SHOW ? (
              <p className="es-demand-more">+ {report.excluded.length - SHOW} more ruled out</p>
            ) : null}
          </div>
        </div>

        {report.topReasons.length > 0 ? (
          <div className="es-demand-reasons" style={{ marginTop: '1rem' }}>
            <span className="es-demand-reasons-label">Most common reasons work didn&rsquo;t qualify</span>
            <div className="es-demand-chips">
              {report.topReasons.slice(0, 5).map((reason) => (
                <span className="es-demand-chip" key={reason.label}>
                  {reason.label} <b>{reason.count}</b>
                </span>
              ))}
            </div>
            {report.topReasons.some((r) => r.label.toLowerCase().includes('long') || r.label.toLowerCase().includes('visit')) ? (
              <p style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>💡 Tip:</span>
                <span>Work longer than {maxVisitMinutes}m was excluded. You can adjust your maximum visit duration in the <Link href="/dashboard/quick-stops?tab=settings#quick-stop-setup" style={{ color: '#ff9a52', textDecoration: 'underline' }}>Settings tab</Link>.</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {enabled && reachable > 0 ? (
          <div className="es-demand-tell" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <strong>Promote Quick Stops to {reachable} Past Customers</strong>
              <p>
                Quick Stops appear on your booking page, but past clients often don&rsquo;t check your website when a small repair pops up. You have <strong>{reachable}</strong> past {reachable === 1 ? 'client' : 'clients'} you can announce Quick Stops to via email or SMS.
              </p>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPitchOpen(!pitchOpen)}
                  className="btn secondary"
                  style={{ minHeight: '38px', fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}
                >
                  {pitchOpen ? 'Hide Pitch Preview' : '👁️ Preview Customer Pitch'}
                </button>
                <Link href="/dashboard/marketing/campaigns?draft=extra-stop#new-campaign" className="btn primary" style={{ minHeight: '38px', fontSize: '0.82rem', padding: '0.35rem 0.85rem' }}>
                  Create Announcement Campaign →
                </Link>
              </div>
            </div>

            {pitchOpen ? (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(var(--tint, 255,255,255), 0.04)', borderRadius: '10px', border: '1px solid var(--edge-t10, rgba(255,255,255,0.1))', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#ff9a52' }}>📱 SMS Announcement Template</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy('sms')}
                    className="btn ghost"
                    style={{ minHeight: '32px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    {copiedType === 'sms' ? '✓ Copied SMS' : '📋 Copy SMS'}
                  </button>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', fontSize: '0.84rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
                  {pitch.sms}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#ff9a52', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><MailIcon /> Email Announcement Template</h4>
                  <button
                    type="button"
                    onClick={() => handleCopy('email')}
                    className="btn ghost"
                    style={{ minHeight: '32px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    {copiedType === 'email' ? '✓ Copied Email' : '📋 Copy Email'}
                  </button>
                </div>
                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', fontSize: '0.84rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  <strong>Subject: {pitch.subject}</strong>
                  <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{pitch.body}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <details className="es-demand-rules" style={{ marginTop: '1rem' }}>
          <summary>What never qualifies, and why</summary>
          <div className="es-demand-rules-body">
            <div>
              <h4>Never — customer gets safety instructions instead of a price</h4>
              <p>Work that shouldn&rsquo;t be booked via automated form (gas, mould, active hazards).</p>
              <ul>
                {rules.unsafe.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Not a short visit — offered normal scheduled booking</h4>
              <p>Work exceeding {maxVisitMinutes} estimated minutes.</p>
              <ul>
                {rules.outOfScope.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        <p className="es-demand-note" style={{ marginTop: '0.75rem' }}>
          {CANDIDATE_AI_NOTE}
        </p>

        {leftOutNote}
      </section>
    </div>
  );
}
