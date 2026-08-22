import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
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
import styles from '../admin.module.css';

const PROVIDER_LABEL: Record<SmsProviderId, string> = {
  twilio: 'Twilio',
  signalwire: 'SignalWire',
};

/**
 * Is anything running?
 *
 * Every other health signal in this console is a downstream failure log — a
 * webhook that arrived and could not be processed, an email that bounced. All
 * of those require something to have HAPPENED. The failure this page exists for
 * is the opposite kind: a scheduled job that stops firing produces no errors at
 * all, because nothing runs to produce them. Recurring charges quietly stop
 * being collected and every screen looks healthy.
 *
 * So the top half is the heartbeat, and the bottom half gathers the existing
 * failure logs beside it — the two halves answer "did it run" and "did what ran
 * work", and neither is much use without the other.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Service health' };

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

// Order the page reads in: what is wrong first, and within that, what costs
// money first. A health page sorted alphabetically makes you find the problem.
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

/** The job's own summary, flattened to the counts worth seeing in a table cell. */
function summaryLine(summary: Record<string, unknown> | null): string {
  if (!summary) return '';
  const parts = Object.entries(summary)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
    .slice(0, 5)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
  return parts.join(' · ');
}

export default async function AdminHealthPage() {
  const { admin } = await requireAdmin();
  const now = new Date();
  const diagnostics = createAdminSignalDiagnostics();

  const [{ last, lastSuccessAt, failedJobs }, webhookFailures, failedEmails, failedSms, voiceOperations] = await Promise.all([
    loadCronStatus(admin, CRON_JOBS.map((j) => j.job)),
    getUnresolvedWebhookFailures(admin, { diagnostics }),
    getFailedEmailEvents(admin, { diagnostics }),
    getFailedSmsEvents(admin, { diagnostics }),
    loadVoiceOperatorHealth(admin),
  ]);

  // Pure env read, no await — the provider is configuration, not state.
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
        <p className={styles.eyebrow}>Operations</p>
        <h1 className={styles.title}>Service health</h1>
        <p className={styles.lead}>
          {CRON_JOBS.length} scheduled jobs keep this product running, and {moneyJobCount} of them collect money. Until each one recorded
          its own runs, a job that stopped firing was invisible — it produces no errors, because nothing runs to produce
          them. This is that record.
        </p>
      </header>

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
        // The state immediately after this ships, and it must not read as an
        // outage. Nothing has reported because nothing has run since the
        // recording was added, not because everything is broken.
        <div className={`${styles.banner} ${styles.ok}`}>
          No runs recorded yet. Each job appears here the first time it fires after this was deployed — the slowest is
          weekly, so give it a few days before reading anything into a quiet table.
        </div>
      ) : (
        <div className={`${styles.banner} ${styles.ok}`}>Every job that has reported is running on schedule.</div>
      )}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Scheduled jobs</h2>
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
                      {/* Stated rather than implied: the badge above is a
                          judgement, and a reader should be able to check it
                          without knowing the grace rule. */}
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
                      {/* The consequence is only worth the space when something
                          is wrong. On a healthy row it is noise; on a broken one
                          it is the reason to care. */}
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

      {/* The pre-existing failure logs, gathered beside the heartbeat. These
          answer "did what ran work"; the table above answers "did it run". */}
      {/* Which provider is sending, and which signatures we will accept.
          READ-ONLY, DELIBERATELY. Every other integration on this page is
          reported rather than controlled, and messaging is the one where a
          control would be actively dangerous: the credentials live in the
          environment — a sending token in Postgres is a token in every pg_dump
          and every service-role read, which here means every admin page and
          every webhook route — so a toggle could only point at secrets it does
          not hold, and one click could select a provider that cannot send. The
          flip is LGQ_SMS_PROVIDER plus a deploy: atomic, timestamped and
          revertible, which is what you want the day a delivery callback signed
          by the old provider turns up four minutes after the change.

          The line that earns this card is "accepted signatures". During a
          cutover it is the only place that tells you, in one glance, whether
          inbound texts from BOTH providers will validate. */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Messaging provider</h2>
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
                    // Silent until now: no trusted HTTPS LGQ origin means no
                    // StatusCallback is sent, so "Failed texts" below can only
                    // ever be zero and looks like good news.
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
            {/* Says what it covers. Only the payment and crew senders write
                sms_events, so a zero here has never meant "no texts failed" —
                and a health page that overstates its own coverage is how staff
                stop checking Twilio. */}
            <span className={styles.muted} style={{ fontSize: '.7rem' }}>
              payment &amp; crew senders only
            </span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>What this page cannot tell you</h2>
        {/* Stated openly, because the gap between "everything green" and
            "everything fine" is exactly where a monitoring page does its
            damage. */}
        <ul className={styles.timeline}>
          <li>
            <time>Coverage</time>
            <span>
              A job is graded on whether it ran, finished, stayed on cadence, and reported an explicit failed or error
              count. A logically wrong result with no failure counter can still look healthy, so unusual processed or
              skipped totals still require investigation.
            </span>
          </li>
          <li>
            <time>Timing</time>
            <span>
              Schedules are UTC, and lateness is measured against the interval in <code>vercel.json</code>, not against
              Vercel&rsquo;s own record of whether it dispatched. If Vercel never called us, that looks identical to a
              job that failed to start.
            </span>
          </li>
          <li>
            <time>Web requests</time>
            <span>
              Nothing here watches the site itself — uptime, response times and error rates need an APM, and there is
              none wired up. This is the scheduled work only.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
