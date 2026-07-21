import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction } from './stripe-actions';
import { expandScheduledJobs, formatJobTime, listJobs } from '@/lib/jobs';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { expireStaleLeads, listLeads } from '@/lib/leads';
import { listActiveScheduleRequests } from '@/lib/scheduling';

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const statePattern = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const cityPart = parts.find((part, index) => index > 0 && !statePattern.test(part));
  if (cityPart) return cityPart;

  const stateIndex = parts.findIndex((part) => statePattern.test(part));
  const fallback = stateIndex > 0 ? parts[stateIndex - 1] : parts[0];
  const inferredCity = fallback.match(/(?:\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Circle|Cir)\b\.?\s+)(.+)$/i)?.[1];
  return inferredCity || fallback || 'No address on file';
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function DashboardPage() {
  const { supabase, accountId } = await requireOwnerContext();
  await expireStaleLeads(supabase, accountId);

  const [{ data: account }, { data: identityData }, { data: site }, jobs, leads] = await Promise.all([
    supabase.from('accounts').select('connect_onboarded, connect_disabled_at, schedule_day_hours').eq('id', accountId).single(),
    supabase.auth.getUserIdentities(),
    supabase.from('sites').select('published, subdomain, custom_domain, custom_domain_verified_at').eq('account_id', accountId).maybeSingle(),
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
  ]);

  const onboarded = account?.connect_onboarded ?? false;
  // Distinct from "never onboarded": Stripe disabled transfers on an account
  // that was previously working, so the contractor can no longer be paid until
  // they resolve it. This warrants a prominent alert, not the generic nudge.
  const connectDisabledAt = account?.connect_disabled_at ?? null;
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
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

  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours);
  const activeJobs = jobs.filter((job) => job.status === 'in_progress').length;
  const openLeadCount = leads.filter((lead) => lead.status === 'new' || lead.status === 'contacted').length;
  const quotedLeadCount = leads.filter((lead) => lead.status === 'quoted').length;
  const wonLeadCount = leads.filter((lead) => lead.status === 'won').length;
  const [crew, assignmentsByJob] = await Promise.all([
    listCrew(supabase, accountId, { activeOnly: true }),
    listCrewAssignmentsForJobs(supabase, accountId, scheduledJobs.map((job) => job.id)),
  ]);
  const jobsByDate = new Map<string, typeof scheduledJobOccurrences>();
  for (const job of scheduledJobOccurrences) {
    const key = job.scheduled_for;
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
  const jobsNext7Days = next7Days.reduce((sum, day) => sum + day.jobs.length, 0);
  const jobsNeedingCrewCount = next7Days.reduce(
    (sum, day) => sum + day.jobs.filter((job) => (assignmentsByJob[job.id] ?? []).length === 0).length,
    0
  );
  const jobsMissingTimeCount = next7Days.reduce(
    (sum, day) => sum + day.jobs.filter((job) => !job.scheduled_time).length,
    0
  );
  const unscheduledActiveJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived' && !job.scheduled_for);
  const unscheduledJobCount = unscheduledActiveJobs.length;
  // Count jobs whose LATEST live schedule request is "needs more options" — a
  // raw count of needs_more_options rows would over-count (the status is never
  // cleared once set) and disagree with the schedule board, which dedupes to
  // the latest request per job via the same helper.
  const scheduleRequestByJob = await listActiveScheduleRequests(supabase, accountId, unscheduledActiveJobs.map((job) => job.id));
  const stuckScheduleCount = Object.values(scheduleRequestByJob).filter((request) => request.status === 'needs_more_options').length;
  // Setup tasks (Stripe, website) live in the onboarding checklist and the
  // topbar pills — keeping them out of the priority list stops the triple-listing
  // and prevents the 5-item cap from bumping real operational work.
  const priorityItems = [
    openLeadCount > 0
      ? {
          key: 'leads',
          label: `${openLeadCount} lead${openLeadCount === 1 ? '' : 's'} waiting`,
          detail: 'Send a quote or follow up before the lead goes cold.',
          href: '/dashboard/leads',
          cta: 'Review leads',
        }
      : null,
    quotedLeadCount > 0
      ? {
          key: 'quoted',
          label: `${quotedLeadCount} quote${quotedLeadCount === 1 ? '' : 's'} awaiting approval`,
          detail: 'Follow up with homeowners who have not signed off yet.',
          href: '/dashboard/leads',
          cta: 'View quotes',
        }
      : null,
    stuckScheduleCount > 0
      ? {
          key: 'schedule-response',
          label: `${stuckScheduleCount} client${stuckScheduleCount === 1 ? '' : 's'} want${stuckScheduleCount === 1 ? 's' : ''} different dates`,
          detail: 'They passed on the times you sent — send a fresh set of dates.',
          href: '/dashboard/schedule#unscheduled-jobs',
          cta: 'Send new dates',
        }
      : null,
    jobsNeedingCrewCount > 0
      ? {
          key: 'crew',
          label: `${jobsNeedingCrewCount} scheduled job${jobsNeedingCrewCount === 1 ? '' : 's'} need crew`,
          detail: 'Assign crew before the work day starts.',
          href: '/dashboard/schedule',
          cta: 'Open schedule',
        }
      : null,
    jobsMissingTimeCount > 0
      ? {
          key: 'time',
          label: jobsMissingTimeCount === 1 ? '1 job needs a start time' : `${jobsMissingTimeCount} jobs need start times`,
          detail: 'Add start times so the week is easier to run.',
          href: '/dashboard/schedule',
          cta: 'Set times',
        }
      : null,
    unscheduledJobCount > 0
      ? {
          key: 'unscheduled',
          label: `${unscheduledJobCount} open job${unscheduledJobCount === 1 ? '' : 's'} not scheduled`,
          detail: 'Put approved work on the calendar.',
          href: '/dashboard/schedule#unscheduled-jobs',
          cta: 'Schedule work',
        }
      : null,
  ].filter((item): item is { key: string; label: string; detail: string; href: string; cta: string } => Boolean(item)).slice(0, 5);

  return (
    <main className="wide-shell workspace-shell">
      {connectDisabledAt ? (
        <section
          className="panel workspace-section-card"
          style={{ borderColor: '#dc2626', background: 'rgba(220, 38, 38, 0.06)' }}
        >
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow" style={{ color: '#dc2626' }}>⚠ Payouts paused</p>
            <h2>Stripe disabled your payments</h2>
          </div>
          <p className="workspace-card-copy">
            Stripe has turned off transfers for your account, so homeowner deposits and
            stage payments can&apos;t be collected right now. This usually means Stripe needs
            more information to keep your account verified. Reconnect to see what&apos;s required
            and restore payouts.
          </p>
          <div className="actions" style={{ marginTop: '0.75rem' }}>
            <Link href="/dashboard/settings" className="btn primary">
              Resolve payout issue
            </Link>
          </div>
        </section>
      ) : null}

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

      <section className="panel workspace-section-card priority-panel">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Today&apos;s priorities</p>
          <h2>What needs attention</h2>
        </div>
        {priorityItems.length > 0 ? (
          <div className="priority-list">
            {priorityItems.map((item, index) => (
              <Link href={item.href} className="priority-item" key={item.key}>
                <span className="priority-index">{index + 1}</span>
                <span className="priority-copy">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
                <span className="priority-cta">{item.cta}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="priority-empty">
            <strong>Nothing urgent right now.</strong>
            <span>Your leads, jobs, schedule, website, and payout setup are in good shape.</span>
          </div>
        )}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Snapshot</p>
          <h2>Account overview</h2>
        </div>

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
            <span className="workspace-metric-label">Leads waiting</span>
            <strong className="workspace-metric-value">{openLeadCount}</strong>
            <p className="workspace-metric-note">
              New and contacted leads that still need a quote or follow-up.
            </p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Jobs this week</span>
            <strong className="workspace-metric-value">{jobsNext7Days}</strong>
            <p className="workspace-metric-note">
              Scheduled job days across the next 7-day dashboard calendar.
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
                  day.jobs.map((job) => {
                    const assignedMembers = (assignmentsByJob[job.id] ?? [])
                      .map((id) => crew.find((member) => member.id === id))
                      .filter((member): member is NonNullable<typeof member> => Boolean(member));
                    return (
                      <Link key={`${job.id}:${job.scheduled_for}`} href={`/dashboard/jobs/${job.id}`} className="week-glance-job">
                        <span className="week-glance-job-top">
                          <strong>{job.client_name}</strong>
                          {assignedMembers.length > 0 ? (
                            <span className="week-glance-crew" title={`Assigned: ${assignedMembers.map((member) => member.name).join(', ')}`}>
                              {assignedMembers.slice(0, 2).map((member) => initials(member.name)).join(' ')}
                            </span>
                          ) : null}
                        </span>
                        <span>{[formatJobTime(job.scheduled_time), extractCity(job.address)].filter(Boolean).join(' - ')}</span>
                      </Link>
                    );
                  })
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
            <p className="eyebrow">Pipeline focus</p>
            <h2>Lead momentum</h2>
          </div>
          <div className="tier-card">
            <div className="tier-row">
              <span>Quoted leads awaiting homeowner approval</span>
              <span>{quotedLeadCount}</span>
            </div>
            <div className="tier-row bold">
              <span>Active jobs</span>
              <span>{activeJobs}</span>
            </div>
            <div className="tier-row">
              <span>Won leads</span>
              <span>{wonLeadCount}</span>
            </div>
            <p className="tier-note">Keep quotes moving from approval into scheduled work.</p>
          </div>
        </div>
      </section>
    </main>
  );
}


