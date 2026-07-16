import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction } from './stripe-actions';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo } from '@/lib/stripe';
import { listJobs, type Job } from '@/lib/jobs';

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

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

export default async function DashboardPage() {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: account }, { data: identityData }, jobs] = await Promise.all([
    supabase.from('accounts').select('connect_onboarded').eq('id', accountId).single(),
    supabase.auth.getUserIdentities(),
    listJobs(supabase, accountId),
  ]);

  const onboarded = account?.connect_onboarded ?? false;
  const linkedMethodCount = identityData?.identities?.length ?? 1;

  const trailingVolume = onboarded ? await getTrailingVolume(accountId) : 0;
  const tierInfo = getTierInfo(trailingVolume);
  const progressPercent = Math.round((tierInfo.progressToNext ?? 0) * 100);

  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const jobsByDate = new Map<string, Job[]>();
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

  return (
    <main className="wide-shell workspace-shell">
      {linkedMethodCount <= 1 ? (
        <div className="backup-signin-banner">
          <p>You&apos;re only signed in one way. Add a backup sign-in method so you&apos;re never locked out of your business.</p>
          <Link href="/dashboard/settings" className="btn secondary">Add a backup method</Link>
        </div>
      ) : null}

      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Owner dashboard</p>
          <h1 className="workspace-title">Contractor operations workspace</h1>
          <p className="workspace-lead">
            Membership ownership is enforced server-side. From here you can manage jobs,
            request homeowner payments, and monitor payout readiness.
          </p>
          <div className="actions workspace-actions">
            <Link href="/dashboard/jobs" className="btn primary">
              View jobs
            </Link>
            <Link href="/" className="btn secondary">
              Back home
            </Link>
          </div>
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Payments setup</span>
            <strong className="workspace-metric-value">{onboarded ? 'Connected' : 'Needs action'}</strong>
            <p className="workspace-metric-note">
              {onboarded
                ? 'Payout routing is active for homeowner deposit and stage payments.'
                : 'Finish Stripe onboarding to activate direct contractor payouts.'}
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
                : 'You are already at the lowest platform fee tier.'}
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
                    <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="week-glance-job">
                      <strong>{job.client_name}</strong>
                      <span>{extractCity(job.address)}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-grid two-up">
        <div className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Payments</p>
            <h2>Stripe readiness</h2>
          </div>
          {onboarded ? (
            <p className="workspace-card-copy">
              Stripe payouts are connected. Homeowner deposit requests will route funds to your
              account as payments move through the workflow.
            </p>
          ) : (
            <>
              <p className="workspace-card-copy">
                Connect a Stripe account so homeowner deposits and stage payments can be routed
                directly to you.
              </p>
              <form action={connectStripeAction}>
                <button type="submit" className="btn primary">
                  Connect with Stripe
                </button>
              </form>
            </>
          )}
        </div>

        <div className="panel workspace-section-card">
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
                  {formatMoney(tierInfo.amountToNextTier ?? 0)} more in volume unlocks Tier{' '}
                  {tierInfo.nextTier.tier} at {formatRate(tierInfo.nextTier.rate)}.
                </p>
              </>
            ) : (
              <p className="tier-note">You&apos;ve reached the lowest platform fee rate.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}


