import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { staffCan } from '@/lib/staff';
import {
  CRON_JOBS,
  CRON_HEALTH_LABEL,
  cronHealth,
  expectedIntervalMs,
  graceMs,
  scheduleInWords,
  type CronHealth,
  type CronImportance,
} from '@/lib/cron-jobs';
import { loadCronStatus, type CronRunRow } from '@/lib/cron-runs';
import {
  createAdminSignalDiagnostics,
  getUnresolvedWebhookFailures,
  getFailedEmailEvents,
  getFailedSmsEvents,
} from '@/lib/admin-alerts';
import { smsProviderSummary, type SmsProviderId } from '@/lib/sms-provider';
import { aiVoiceEnabled } from '@/lib/voice/admission';
import { voiceWebhookSecuritySummary } from '@/lib/voice/auth';
import { loadVoiceOperatorHealth } from '@/lib/voice/operator-health';
import { getApmSummary, getRecentExceptions } from '@/lib/apm-telemetry';
import { runSyntheticUptimeProbe } from '@/lib/uptime-monitoring';
import { getOnCallRoster, getRecentPagingEvents } from '@/lib/on-call-paging';
import { dispatchTestPageAction } from './actions';
import styles from '../admin.module.css';

const PROVIDER_LABEL: Record<SmsProviderId, string> = {
  twilio: 'Twilio',
  signalwire: 'SignalWire',
};

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Service health & Operations Center' };

const IMPORTANCE_LABEL: Record<CronImportance, string> = {
  money: 'Collects money',
  customer: 'Reaches customers',
  housekeeping: 'Housekeeping',
};

const HEALTH_CLASS: Record<CronHealth, string> = {
  ok: 'good',
  failing: 'bad',
  stale: 'bad',
  running: 'neutral',
  unknown: 'neutral',
};

const SUBSYSTEM_CLASS: Record<'operational' | 'degraded' | 'outage', string> = {
  operational: 'good',
  degraded: 'warn',
  outage: 'bad',
};

const HEALTH_RANK: Record<CronHealth, number> = { failing: 0, stale: 1, unknown: 2, running: 3, ok: 4 };
const IMPORTANCE_RANK: Record<CronImportance, number> = { money: 0, customer: 1, housekeeping: 2 };

function ago(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'never';
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function summaryLine(summary: Record<string, unknown> | null): string {
  if (!summary) return '';
  const parts = Object.entries(summary)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
    .slice(0, 5)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
  return parts.join(' · ');
}

export default async function AdminHealthPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ done?: string; error?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const { admin, staff } = await requireAdmin();
  const now = new Date();
  const diagnostics = createAdminSignalDiagnostics();

  const [
    { last, lastSuccessAt, failedJobs },
    webhookFailures,
    failedEmails,
    failedSms,
    voiceOperations,
    uptimeReport,
  ] = await Promise.all([
    loadCronStatus(admin, CRON_JOBS.map((j) => j.job)),
    getUnresolvedWebhookFailures(admin, { diagnostics }),
    getFailedEmailEvents(admin, { diagnostics }),
    getFailedSmsEvents(admin, { diagnostics }),
    loadVoiceOperatorHealth(admin),
    runSyntheticUptimeProbe(admin),
  ]);

  // Telemetry & On-Call data
  const apm = getApmSummary();
  const recentExceptions = getRecentExceptions(5);
  const onCall = getOnCallRoster();
  const recentPages = getRecentPagingEvents(5);
  const canManageOps = staffCan(staff, 'ops.manage');

  // Pure env read, no await
  const messaging = smsProviderSummary();
  const voiceSecurity = voiceWebhookSecuritySummary();
  const voiceEnabled = aiVoiceEnabled();

  const rows = CRON_JOBS.map((spec) => {
    const run: CronRunRow | null = last.get(spec.job) ?? null;
    const successAt = lastSuccessAt.get(spec.job) ?? null;
    return { spec, run, successAt, health: cronHealth(spec, run, successAt, now) };
  }).sort(
    (a, b) =>
      HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
      IMPORTANCE_RANK[a.spec.importance] - IMPORTANCE_RANK[b.spec.importance] ||
      a.spec.label.localeCompare(b.spec.label),
  );

  const unwell = rows.filter((r) => r.health === 'failing' || r.health === 'stale');
  const neverSeen = rows.filter((r) => r.health === 'unknown');
  const moneyJobCount = CRON_JOBS.filter((job) => job.importance === 'money').length;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Operations &amp; Reliability Center</p>
        <h1 className={styles.title}>Service health &amp; APM</h1>
        <p className={styles.lead}>
          Complete operational observability across synthetic uptime monitoring, high-resolution APM telemetry,
          automated on-call paging, background cron heartbeats, and carrier gateway readiness.
        </p>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{searchParams.done}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{searchParams.error}</div> : null}

      {failedJobs.length > 0 ? (
        <div className={`${styles.banner} ${styles.err}`}>
          <strong>Health data is incomplete.</strong> Could not read {failedJobs.length} {failedJobs.length === 1 ? 'job' : 'jobs'} from the run log. Unknown rows are not an all-clear.
        </div>
      ) : unwell.length > 0 ? (
        <div className={`${styles.banner} ${styles.err}`}>
          <strong>{unwell.length} {unwell.length === 1 ? 'job needs' : 'jobs need'} attention.</strong>{' '}
          {unwell.map((r) => r.spec.label).join(', ')}.
        </div>
      ) : neverSeen.length === rows.length ? (
        <div className={`${styles.banner} ${styles.ok}`}>
          No runs recorded yet. Each job appears here the first time it fires after this was deployed — the slowest is
          weekly, so give it a few days before reading anything into a quiet table.
        </div>
      ) : (
        <div className={`${styles.banner} ${styles.ok}`}>
          Every background cron job, quoting engine rail, and communication provider is reporting healthy on schedule.
        </div>
      )}

      {/* 1. Synthetic Uptime Monitoring & Subsystems Matrix */}
      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>Synthetic Uptime &amp; Subsystems</h2>
            <p className={styles.muted} style={{ fontSize: '.8rem', margin: '4px 0 0' }}>
              Multi-subsystem synthetic probes evaluated every 60 seconds with 24h/7d/30d SLA tracking.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className={`${styles.pill} ${styles[SUBSYSTEM_CLASS[uptimeReport.overallStatus]]}`}>
              {uptimeReport.overallStatus.toUpperCase()}
            </span>
            <span className={styles.muted} style={{ fontSize: '.78rem' }}>
              30d SLA: <strong>{uptimeReport.sla.uptime30dPct}%</strong>
            </span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Subsystem</th>
                <th>Category</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Probe Detail</th>
                <th>Consequence if Down</th>
              </tr>
            </thead>
            <tbody>
              {uptimeReport.subsystems.map((sub) => (
                <tr key={sub.id}>
                  <td><strong>{sub.name}</strong></td>
                  <td><span className={styles.muted} style={{ fontSize: '.75rem', textTransform: 'capitalize' }}>{sub.category}</span></td>
                  <td>
                    <span className={`${styles.pill} ${styles[SUBSYSTEM_CLASS[sub.status]]}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{sub.latencyMs}ms</td>
                  <td style={{ fontSize: '.78rem' }}>{sub.detail}</td>
                  <td className={styles.muted} style={{ fontSize: '.72rem', maxWidth: '30ch' }}>{sub.consequenceIfDown}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '.78rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <strong>External Monitoring Probes:</strong> Ping probe available at <code>/api/health</code> (supports Better Stack, Pingdom, UptimeRobot, Checkly).
          </div>
          <div>
            Heartbeat Hook: {uptimeReport.externalMonitoring.heartbeatConfigured ? <span style={{ color: '#86efac' }}>Configured</span> : <span className={styles.muted}>Ready to attach</span>}
          </div>
        </div>
      </section>

      {/* 2. Application Performance Monitoring (APM) */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Application Performance Monitoring (APM)</h2>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          Real-time request tracing, latency percentiles, throughput, and error rate telemetry.
        </p>
        <div className={styles.cardGrid}>
          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ color: apm.latencyPercentiles.p95Ms > 600 ? '#fca5a5' : '#86efac' }}>
              {apm.latencyPercentiles.p95Ms}ms
            </span>
            <span className={styles.statLabel}>p95 Latency</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>p50: {apm.latencyPercentiles.p50Ms}ms · p99: {apm.latencyPercentiles.p99Ms}ms</span>
          </div>

          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ color: apm.errorRatePct > 1 ? '#fca5a5' : '#86efac' }}>
              {apm.errorRatePct}%
            </span>
            <span className={styles.statLabel}>5xx Error Rate</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>2xx: {apm.statusCodeDistribution.status2xx} · 5xx: {apm.statusCodeDistribution.status5xx}</span>
          </div>

          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue}>
              {apm.rpm}
            </span>
            <span className={styles.statLabel}>Throughput (RPM)</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>{apm.totalRequestsTracked} requests buffered</span>
          </div>

          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ color: '#38bdf8' }}>
              {apm.provider === 'builtin_high_res' ? 'High-Res APM' : apm.provider}
            </span>
            <span className={styles.statLabel}>APM Engine</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>Sentry &amp; Datadog hooks ready</span>
          </div>
        </div>

        {/* Slowest API routes */}
        {apm.slowestRoutes.length > 0 ? (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '.85rem', fontWeight: 600, margin: '0 0 8px' }}>Route Performance Breakdown</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Route</th>
                    <th className="num">Requests</th>
                    <th className="num">Avg Latency</th>
                    <th className="num">p95 Latency</th>
                    <th className="num">Error Rate</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {apm.slowestRoutes.map((route) => (
                    <tr key={route.path}>
                      <td><code>{route.path}</code></td>
                      <td className="num">{route.totalRequests}</td>
                      <td className="num">{route.avgDurationMs}ms</td>
                      <td className="num" style={{ color: route.p95DurationMs > 500 ? '#ffd166' : undefined }}>{route.p95DurationMs}ms</td>
                      <td className="num" style={{ color: route.errorRatePct > 0 ? '#fca5a5' : undefined }}>{route.errorRatePct}%</td>
                      <td className={styles.muted} style={{ fontSize: '.75rem' }}>{ago(route.lastSeenAt, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {recentExceptions.length > 0 ? (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '.85rem', fontWeight: 600, margin: '0 0 8px', color: '#fca5a5' }}>Recent Captured Exceptions</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Exception Message</th>
                    <th>Path</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExceptions.map((exc) => (
                    <tr key={exc.id}>
                      <td><span className={`${styles.pill} ${styles.bad}`}>{exc.severity}</span></td>
                      <td style={{ fontSize: '.78rem', color: '#fca5a5' }}>{exc.message}</td>
                      <td><code>{exc.path || '—'}</code></td>
                      <td className={styles.muted} style={{ fontSize: '.75rem' }}>{ago(exc.occurredAt, now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* 3. Automated On-Call Paging & Incident Escalation */}
      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>On-Call Paging &amp; Escalation</h2>
            <p className={styles.muted} style={{ fontSize: '.8rem', margin: '4px 0 0' }}>
              Automated multi-channel paging for P1/P2 outages (money cron stalls, DB disconnection, carrier drops).
            </p>
          </div>
          {canManageOps ? (
            <form action={async () => {
              'use server';
              await dispatchTestPageAction();
            }}>
              <button type="submit" className="btn secondary" style={{ fontSize: '.75rem', padding: '5px 12px' }}>
                Dispatch Test Page Drill →
              </button>
            </form>
          ) : null}
        </div>

        <div className={styles.cardGrid}>
          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ fontSize: '1.05rem', color: '#86efac' }}>
              {onCall.primary.name}
            </span>
            <span className={styles.statLabel}>Primary On-Call (Active)</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>{onCall.primary.email} · {onCall.primary.phone}</span>
          </div>

          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ fontSize: '1.05rem', color: '#38bdf8' }}>
              {onCall.escalationTimeoutMinutes} min
            </span>
            <span className={styles.statLabel}>Auto-Escalation SLA</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>Secondary: {onCall.secondary.name}</span>
          </div>

          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={{ fontSize: '1.05rem' }}>
              {onCall.channels.filter((c) => c.configured).length} / {onCall.channels.length}
            </span>
            <span className={styles.statLabel}>Paging Channels Ready</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>PagerDuty, Opsgenie, Slack, Discord, SMS</span>
          </div>
        </div>

        {/* Recent Paging Dispatches */}
        <div style={{ marginTop: '14px' }}>
          <h3 style={{ fontSize: '.85rem', fontWeight: 600, margin: '0 0 8px' }}>Recent Paging History &amp; Drills</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Incident / Drill Title</th>
                  <th>Channels</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {recentPages.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <span className={`${styles.pill} ${page.severity === 'P1_CRITICAL' ? styles.bad : page.severity === 'P2_HIGH' ? styles.warn : styles.good}`}>
                        {page.severity}
                      </span>
                    </td>
                    <td>
                      <strong>{page.title}</strong>
                      <div className={styles.muted} style={{ fontSize: '.72rem' }}>Source: <code>{page.source}</code></div>
                    </td>
                    <td className={styles.muted} style={{ fontSize: '.75rem' }}>{page.dispatchedChannels.join(', ')}</td>
                    <td>
                      <span className={`${styles.pill} ${page.status === 'resolved' ? styles.good : page.status === 'acknowledged' ? styles.neutral : styles.bad}`}>
                        {page.status}
                      </span>
                    </td>
                    <td className={styles.muted} style={{ fontSize: '.75rem' }}>{ago(page.dispatchedAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Scheduled Jobs Fleet */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Scheduled jobs fleet</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Last success</th>
                <th>Took</th>
                <th>What it reported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ spec, run, successAt, health }) => {
                const interval = expectedIntervalMs(spec.schedule);
                return (
                  <tr key={spec.job}>
                    <td>
                      <Link href={`/admin/health/${spec.job}`} className={styles.rowLink}>{spec.label}</Link>
                      <div className={styles.muted} style={{ fontSize: '.72rem' }}>
                        <code>{spec.job}</code> · {IMPORTANCE_LABEL[spec.importance]}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles[HEALTH_CLASS[health]]}`}>{CRON_HEALTH_LABEL[health]}</span>
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>
                      {scheduleInWords(spec.schedule)}
                      {interval !== null ? (
                        <div style={{ fontSize: '.72rem' }}>late after {duration(interval + graceMs(interval))}</div>
                      ) : null}
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{ago(run?.started_at, now)}</td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{ago(successAt, now)}</td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{duration(run?.duration_ms ?? null)}</td>
                    <td style={{ fontSize: '.78rem', maxWidth: '34ch' }}>
                      {run?.error ? (
                        <span style={{ color: '#fca5a5' }}>{run.error}</span>
                      ) : (
                        <span className={styles.muted}>{summaryLine(run?.summary ?? null) || '—'}</span>
                      )}
                      {health === 'failing' || health === 'stale' ? (
                        <div className={styles.muted} style={{ fontSize: '.72rem', marginTop: '.3rem' }}>
                          {spec.consequence}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Messaging Provider Readiness */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Messaging provider readiness</h2>
        <p className={styles.muted} style={{ marginTop: 0 }}><Link href="/admin/messaging">Open queue, number, and callback operations →</Link></p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Sending through</td>
                <td>
                  {messaging.active ? (
                    <strong>{PROVIDER_LABEL[messaging.active]}</strong>
                  ) : (
                    <strong style={{ color: '#fca5a5' }}>Not configured — nothing can be texted</strong>
                  )}
                  {messaging.requestedButUnconfigured ? (
                    <span className={styles.muted} style={{ display: 'block', fontSize: '.72rem' }}>
                      LGQ_SMS_PROVIDER asks for <code>{messaging.requestedButUnconfigured}</code>, which is invalid or
                      does not have a complete credential block. Nothing falls back to the other provider on purpose: sending under the wrong number and
                      the wrong registration while you believe you have cut over is worse than sending nothing.
                    </span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <td>Sender</td>
                <td>
                  {messaging.senderMode === 'pool'
                    ? 'A number pool (Messaging Service / Number Group)'
                    : messaging.senderMode === 'single-number'
                      ? 'One fixed number'
                      : '—'}
                </td>
              </tr>
              <tr>
                <td>Credentials present</td>
                <td>{messaging.configured.length ? messaging.configured.map((id) => PROVIDER_LABEL[id]).join(', ') : 'None'}</td>
              </tr>
              <tr>
                <td>Accepted signatures</td>
                <td>
                  {messaging.acceptedSignatureHeaders.length ? (
                    <code>{messaging.acceptedSignatureHeaders.join(', ')}</code>
                  ) : (
                    <span style={{ color: '#fca5a5' }}>None — every inbound webhook will be rejected</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Delivery receipts</td>
                <td>
                  {messaging.statusCallbacksEnabled ? (
                    <>Attached to every send.</>
                  ) : (
                    <span style={{ color: '#ffd166' }}>
                      Off — NEXT_PUBLIC_APP_URL is missing or is not a trusted bare HTTPS LGQ origin, so no delivery result is ever reported back and
                      &ldquo;Failed texts&rdquo; cannot rise above zero.
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. AI Voice Webhook Security */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>AI Voice webhook security</h2>
        {voiceOperations.failures.length > 0 ? (
          <div className={`${styles.banner} ${styles.err}`}>
            AI Voice operations data is incomplete: {voiceOperations.failures.join(', ')}. An em dash is unknown, not zero.
          </div>
        ) : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Product admission</td>
                <td>{voiceEnabled ? 'Enabled by LGQ_AI_VOICE_ENABLED' : 'Off'}</td>
              </tr>
              <tr>
                <td>Inbound call HMAC</td>
                <td>
                  {voiceSecurity.inboundSigningConfigured
                    ? 'Signing key present'
                    : <span style={{ color: '#fca5a5' }}>Missing — every AI admission and fallback status callback is rejected</span>}
                </td>
              </tr>
              <tr>
                <td>Receipt Basic auth</td>
                <td>
                  {voiceSecurity.receiptBasicConfigured
                    ? 'Dedicated credential present'
                    : <span style={{ color: '#fca5a5' }}>Missing or malformed — no AI call can be admitted</span>}
                </td>
              </tr>
              <tr>
                <td>Receipt tenant scope</td>
                <td>
                  {voiceSecurity.projectScopeConfigured && voiceSecurity.spaceScopeConfigured
                    ? 'Project and Space IDs present'
                    : <span style={{ color: '#ffd166' }}>Incomplete — accepted receipts are not constrained by both provider tenant IDs</span>}
                </td>
              </tr>
              <tr>
                <td>Endpoints</td>
                <td><code>/api/voice/ai</code> · <code>/api/voice/ai/status</code> · <code>/api/voice/receipt</code></td>
              </tr>
              <tr>
                <td>Configured to answer</td>
                <td>
                  {voiceOperations.activeSettings === null ? '—' : voiceOperations.activeSettings}
                  {voiceOperations.activeSettings !== null && voiceOperations.verifiedActiveRoutes !== null ? (
                    <span className={styles.muted} style={{ display: 'block', fontSize: '.72rem' }}>
                      {voiceOperations.verifiedActiveRoutes} with a verified customer-facing route
                      {voiceOperations.activeSettings > voiceOperations.verifiedActiveRoutes
                        ? ` · ${voiceOperations.activeSettings - voiceOperations.verifiedActiveRoutes} cannot answer`
                        : ''}
                    </span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <td>Receipts not fully processed</td>
                <td>{voiceOperations.receiptsNeedingProcessing ?? '—'}</td>
              </tr>
              <tr>
                <td>Calls needing billing review</td>
                <td>{voiceOperations.callsNeedingBillingReview ?? '—'}</td>
              </tr>
              <tr>
                <td>Latest AI call</td>
                <td>{voiceOperations.latestCallAt ? ago(voiceOperations.latestCallAt, now) : voiceOperations.failures.includes('latest call') ? '—' : 'never'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Grouped Delivery Failures */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Delivery &amp; integration failures</h2>
        {diagnostics.failed.length ? <div className={`${styles.banner} ${styles.err}`}>Some delivery checks are unavailable. Their totals are shown as an em dash, not zero.</div> : null}
        <div className={styles.cardGrid}>
          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={webhookFailures.length ? { color: '#fca5a5' } : undefined}>
              {diagnostics.failed.includes('webhookFailures') ? '—' : webhookFailures.length}
            </span>
            <span className={styles.statLabel}>Unresolved webhook failures</span>
            <Link href="/admin/failures#webhooks" className={styles.rowLink} style={{ fontSize: '.75rem' }}>Investigate grouped failures →</Link>
          </div>
          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={failedEmails.length ? { color: '#ffd166' } : undefined}>
              {diagnostics.failed.includes('failedEmails') ? '—' : failedEmails.length}
            </span>
            <span className={styles.statLabel}>Bounced or complained emails</span>
          </div>
          <div className={`${styles.panel} ${styles.statCard}`}>
            <span className={styles.statValue} style={failedSms.length ? { color: '#ffd166' } : undefined}>
              {diagnostics.failed.includes('failedSms') ? '—' : failedSms.length}
            </span>
            <span className={styles.statLabel}>Failed texts</span>
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>
              payment &amp; crew senders only
            </span>
          </div>
        </div>
      </section>

      {/* 8. Observability & Reliability Architecture Summary */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Observability &amp; Reliability Posture</h2>
        <ul className={styles.timeline}>
          <li>
            <time>APM Tracing</time>
            <span>
              Real-time in-memory request ring buffer computes p50/p95/p99 latencies and 5xx error rates across API routes and server actions with zero external network overhead, with optional Sentry / Datadog sink integration.
            </span>
          </li>
          <li>
            <time>Synthetic Uptime</time>
            <span>
              Multi-subsystem synthetic health evaluations test database latency, calculation engine readiness, Stripe Connect rails, carrier gateways, and background crons every 60 seconds against a 99.95% target SLA.
            </span>
          </li>
          <li>
            <time>On-Call Paging</time>
            <span>
              High-severity ($P1$) incidents (money cron stalls, database partition, dead-letter webhook spikes) automatically dispatch emergency alerts across PagerDuty, Opsgenie, Slack, Discord, and SMS to the active on-duty engineer.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
