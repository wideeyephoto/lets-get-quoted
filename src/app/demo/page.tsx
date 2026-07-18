import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { getTierInfo } from '@/lib/stripe';
import { formatJobTime, formatMoney, JOB_STATUS_ORDER } from '@/lib/jobs';
import { DEMO_COMPANY_NAME, DEMO_JOBS, DEMO_TRAILING_VOLUME } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

function formatRate(rate: number): string {
  return (rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[1] || parts[0] || 'No address on file';
}

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export default function DemoDashboardPage() {
  const tierInfo = getTierInfo(DEMO_TRAILING_VOLUME);
  const progressPercent = Math.round((tierInfo.progressToNext ?? 0) * 100);

  const scheduledJobs = DEMO_JOBS.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const jobsByDate = new Map<string, typeof DEMO_JOBS>();
  for (const job of scheduledJobs) {
    const key = job.scheduled_for as string;
    const bucket = jobsByDate.get(key) ?? [];
    bucket.push(job);
    jobsByDate.set(key, bucket);
  }

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const next7Days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    const dateKey = toDateKey(day.getFullYear(), day.getMonth(), day.getDate());
    return {
      dateKey,
      label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      jobs: jobsByDate.get(dateKey) ?? [],
    };
  });

  const clients = [...DEMO_JOBS].sort((a, b) => {
    const statusDiff = JOB_STATUS_ORDER[a.status] - JOB_STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return b.quoted_amount - a.quoted_amount;
  });

  return (
    <>
      <DemoNav active="/demo" />
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Snapshot</p>
            <h2>{DEMO_COMPANY_NAME} — account overview</h2>
          </div>

          <div className="workspace-metric-grid">
            <article className="workspace-metric-card accent">
              <span className="workspace-metric-label">Payments setup</span>
              <strong className="workspace-metric-value">Connected</strong>
              <p className="workspace-metric-note">
                Payout routing is active for homeowner deposit and stage payments.
              </p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Fee tier</span>
              <strong className="workspace-metric-value">Tier {tierInfo.tier}</strong>
              <p className="workspace-metric-note">
                Current platform rate {formatRate(tierInfo.rate)} based on trailing volume.
              </p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Trailing volume</span>
              <strong className="workspace-metric-value">{formatMoney(tierInfo.trailingVolume)}</strong>
              <p className="workspace-metric-note">
                {tierInfo.nextTier
                  ? `${progressPercent}% of the way to the next rate break.`
                  : 'Already at the lowest platform fee tier.'}
              </p>
            </article>
          </div>
        </section>

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Week at a glance</p>
            <h2>Next 7 days</h2>
          </div>
          <div className="week-glance-grid">
            {next7Days.map((day) => (
              <div className={`week-glance-day${day.dateKey === todayKey ? ' today' : ''}`} key={day.dateKey}>
                <span className="week-glance-date">{day.label}</span>
                <div className="week-glance-jobs">
                  {day.jobs.length === 0 ? (
                    <p className="week-glance-empty">No jobs</p>
                  ) : (
                    day.jobs.map((job) => (
                      <Link key={job.id} href={`/demo/jobs/${job.id}`} className="week-glance-job">
                        <strong>{job.client_name}</strong>
                        <span>{[formatJobTime(job.scheduled_time), extractCity(job.address)].filter(Boolean).join(' - ')}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Clients</p>
            <h2>Every client, one place</h2>
          </div>
          <div className="job-list">
            {clients.map((job) => (
              <Link key={job.id} href={`/demo/jobs/${job.id}`} className="job-row">
                <div className="job-row-header">
                  <span className="job-ref">{job.ref}</span>
                  <span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                </div>
                <div className="job-client">{job.client_name}</div>
                <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                  <span className="job-meta">{extractCity(job.address)}</span>
                  <span className="job-quoted">{formatMoney(job.quoted_amount)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Volume &amp; fee tier</p>
            <h2>Current pricing band</h2>
          </div>
          <div className="tier-card">
            <div className="tier-row">
              <span>Trailing 12-month volume</span>
              <span>{formatMoney(tierInfo.trailingVolume)}</span>
            </div>
            <div className="tier-row bold">
              <span>Current rate — Tier {tierInfo.tier}</span>
              <span>{formatRate(tierInfo.rate)}</span>
            </div>
            {tierInfo.nextTier ? (
              <>
                <div className="tier-progress-track">
                  <div className="tier-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="tier-note">
                  {formatMoney(tierInfo.amountToNextTier ?? 0)} more in trailing volume unlocks Tier{' '}
                  {tierInfo.nextTier.tier} at {formatRate(tierInfo.nextTier.rate)}.
                </p>
              </>
            ) : (
              <p className="tier-note">Already at the lowest platform fee tier.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
