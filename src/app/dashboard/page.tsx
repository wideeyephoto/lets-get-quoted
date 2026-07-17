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

  const [{ data: account }, { data: identityData }, { data: site }, jobs] = await Promise.all([
    supabase.from('accounts').select('connect_onboarded').eq('id', accountId).single(),
    supabase.auth.getUserIdentities(),
    supabase.from('sites').select('published, subdomain, custom_domain, custom_domain_verified_at').eq('account_id', accountId).maybeSingle(),
    listJobs(supabase, accountId),
  ]);

  const onboarded = account?.connect_onboarded ?? false;
  const linkedMethodCount = identityData?.identities?.length ?? 1;
  const sitePublished = site?.published ?? false;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const siteUrl = sitePublished && site
    ? site.custom_domain && site.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site.subdomain
        ? `https://${site.subdomain}.${rootDomain}`
        : null
    : null;

  const onboardingSteps = [
    {
      key: 'login',
      label: 'Add a backup sign-in method',
      description: "So you're never locked out of your business.",
      done: linkedMethodCount > 1,
      href: '/dashboard/settings',
      cta: 'Add a backup method',
    },
    {
      key: 'website',
      label: 'Build your website',
      description: 'Design and publish your contractor site — the fun part!',
      done: sitePublished,
      href: '/dashboard/sites',
      cta: 'Build your site',
    },
    {
      key: 'stripe',
      label: 'Connect Stripe payouts',
      description: 'Get paid directly for deposits and stage payments.',
      done: onboarded,
      href: '/dashboard/settings',
      cta: 'Connect Stripe',
    },
  ];
  const completedStepCount = onboardingSteps.filter((step) => step.done).length;
  const onboardingComplete = completedStepCount === onboardingSteps.length;

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
      {!onboardingComplete ? (
        <section className="panel workspace-section-card onboarding-panel">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Get set up</p>
            <h2>Onboarding checklist</h2>
          </div>
          <p className="onboarding-progress-note">
            {completedStepCount} of {onboardingSteps.length} steps complete.
          </p>
          <div className="onboarding-checklist">
            {onboardingSteps.map((step, index) => (
              <div className={`onboarding-step${step.done ? ' done' : ''}`} key={step.key}>
                <div className="onboarding-step-info">
                  <span className="onboarding-step-check">{step.done ? '✓' : index + 1}</span>
                  <div>
                    <span className="onboarding-step-name">{step.label}</span>
                    <p className="onboarding-step-desc">{step.description}</p>
                  </div>
                </div>
                {step.done ? (
                  <span className="status-badge status-complete">Done</span>
                ) : (
                  <Link href={step.href} className="btn secondary">
                    {step.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="workspace-hero workspace-hero-solo panel">
        {siteUrl ? (
          <div className="actions" style={{ marginBottom: '1.1rem' }}>
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="btn fun">
              🚀 Visit your site
            </a>
          </div>
        ) : null}

        <div className="workspace-metric-grid">
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


