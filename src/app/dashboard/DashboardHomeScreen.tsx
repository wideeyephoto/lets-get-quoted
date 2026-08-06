import Link from 'next/link';
import AutomationLink from '@/components/automation-link';
import { formatJobTime, formatMoney } from '@/lib/jobs';
import { leadBreakdown } from '@/lib/lead-summary';
import type { DashboardHome } from '@/lib/dashboard-home-data';
import BlogReminderBanner from './BlogReminderBanner';

/**
 * The dashboard home, given its figures.
 *
 * Split out of page.tsx so the logged-out demo renders the same first screen a
 * prospect would get after signing up. Every count here has to agree with every
 * other one — the priority list, the week strip and the snapshot all read the
 * same jobs and leads — which is exactly what a hand-drawn demo copy of this
 * page could not keep true.
 */

function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const statePattern = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const cityPart = parts.find((part, index) => index > 0 && !statePattern.test(part));
  if (cityPart) return cityPart;

  const stateIndex = parts.findIndex((part) => statePattern.test(part));
  const fallback = stateIndex > 0 ? parts[stateIndex - 1] : parts[0];
  const inferredCity = fallback?.match(/(?:\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Circle|Cir)\b\.?\s+)(.+)$/i)?.[1];
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

export default function DashboardHomeScreen({
  home,
  basePath = '/dashboard',
  readOnly = false,
}: {
  home: DashboardHome;
  basePath?: string;
  /** The demo: automation switches read as state, not as controls. */
  readOnly?: boolean;
}) {
  const {
    connectDisabledAt, onboardingComplete, onboardingSteps, completedStepCount,
    topPriorities, restPriorities, quietDays, next7Days, todayKey, assignmentsByJob, crew,
    siteUrl, sitePublished, bookingSubdomain, rebookDue, privateFeedback,
    leadStats, jobsNext7Days, reviewsOn, followupsOn, remindersOn, dailyDigestOn,
    automation, blogReminderWeeks, lastPublishedBlogISO, blogTopicSuggestion,
  } = home;
  const priorityCount = topPriorities.length + restPriorities.length;

  return (
    <main className="wide-shell workspace-shell">
      <h1 className="sr-only">Dashboard</h1>
      {connectDisabledAt ? (
        <section
          className="panel workspace-section-card"
          style={{ borderColor: '#dc2626', background: 'rgba(220, 38, 38, 0.06)' }}
        >
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow" style={{ color: 'var(--bad)' }}>⚠ Payouts paused</p>
            <h2>Stripe disabled your payments</h2>
          </div>
          <p className="workspace-card-copy">
            Stripe has turned off transfers for your account, so homeowner deposits and
            stage payments can&apos;t be collected right now. This usually means Stripe needs
            more information to keep your account verified. Reconnect to see what&apos;s required
            and restore payouts.
          </p>
          <div className="actions" style={{ marginTop: '0.75rem' }}>
            <Link href={`${basePath}/settings`} className="btn primary">
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
        {priorityCount > 0 ? (
          <>
            <div className="priority-list">
              {topPriorities.map((item, index) => (
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
            {restPriorities.length > 0 ? (
              <details className="priority-more">
                <summary>
                  {restPriorities.length} more thing{restPriorities.length === 1 ? '' : 's'} to look at
                </summary>
                <div className="priority-list">
                  {restPriorities.map((item, index) => (
                    <Link href={item.href} className="priority-item" key={item.key}>
                      <span className="priority-index">{index + 4}</span>
                      <span className="priority-copy">
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </span>
                      <span className="priority-cta">{item.cta}</span>
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <div className="priority-empty">
            <strong>Nothing urgent right now.</strong>
            <span>Your leads, jobs, schedule, website, and payout setup are in good shape.</span>
          </div>
        )}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Week at a glance</p>
          <h2>Next 7 days</h2>
        </div>
        {/* A phone gets one column, so seven cards became seven rows and four
            of them said "No jobs". The quiet days are named once in a line and
            hidden below 640px; the desktop grid is untouched, because seven
            columns side by side is where an empty day is actually useful
            information. */}
        {quietDays.length > 0 && quietDays.length < 7 ? (
          <p className="week-glance-quiet">
            Clear: {quietDays.map((day) => day.shortLabel).join(', ')}
          </p>
        ) : null}
        <div className="week-glance-grid">
          {next7Days.map((day) => (
            <div
              className={`week-glance-day${day.dateKey === todayKey ? ' today' : ''}${day.jobs.length === 0 ? ' is-quiet' : ''}`}
              key={day.dateKey}
            >
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
                      <Link key={`${job.id}:${job.scheduled_for}`} href={`${basePath}/jobs/${job.id}`} className="week-glance-job">
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

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          {/* "Account overview" promised your account and delivered public site
              links and lead counts. What is in here is the business. */}
          <p className="eyebrow">Snapshot</p>
          <h2>Business snapshot</h2>
        </div>

        {siteUrl ? (
          <div className="actions" style={{ marginBottom: '1.1rem' }}>
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="btn fun">
              🚀 Visit your site
            </a>
            {sitePublished && bookingSubdomain ? (
              <a href={`/book/${bookingSubdomain}`} target="_blank" rel="noopener noreferrer" className="btn secondary">
                📅 Online booking page
              </a>
            ) : null}
            {rebookDue > 0 ? (
              <Link href={`${basePath}/rebook`} className="btn secondary">
                ↺ {rebookDue} customer{rebookDue === 1 ? '' : 's'} due to rebook
              </Link>
            ) : null}
            {privateFeedback > 0 ? (
              <Link href={`${basePath}/reviews`} className="btn secondary">
                💬 {privateFeedback} private review{privateFeedback === 1 ? '' : 's'} to address
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="workspace-metric-grid">
          {/* ONE lead number, with the parts that make it up underneath. The
              breakdown adds up to the headline on purpose — three different
              totals in three places is what made all three meaningless. */}
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Open leads</span>
            <strong className="workspace-metric-value">{leadStats.open}</strong>
            <p className="workspace-metric-note">{leadBreakdown(leadStats)}</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Jobs this week</span>
            <strong className="workspace-metric-value">{jobsNext7Days}</strong>
            <p className="workspace-metric-note">
              Scheduled job days across the next 7 days.
            </p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        {/* Was one section mixing four different things: which automations are
            on, what they produced, and a log of individual sends. Which ones are
            ON is a setting; what they did is a result; the log is history. */}
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Automation status</p>
          <h2>What&apos;s switched on</h2>
        </div>
        <div className="automation-status-row">
          {readOnly ? (
            // State, not a control. AutomationLink navigates into Settings,
            // which a logged-out visitor cannot reach.
            [
              { label: 'Review requests', on: reviewsOn },
              { label: 'Quote follow-ups', on: followupsOn },
              { label: 'Appointment reminders', on: remindersOn },
              { label: 'Daily digest', on: dailyDigestOn },
            ].map((item) => (
              <span key={item.label} className={`status-badge ${item.on ? 'status-complete' : 'status-archived'}`}>
                {item.label}: {item.on ? 'ON' : 'OFF'}
              </span>
            ))
          ) : (
            <>
              <AutomationLink id="reviews" label="Review requests" on={reviewsOn} />
              <AutomationLink id="followups" label="Quote follow-ups" on={followupsOn} />
              <AutomationLink id="reminders" label="Appointment reminders" on={remindersOn} />
              <AutomationLink id="daily-digest" label="Daily digest" on={dailyDigestOn} />
            </>
          )}
        </div>
        {automation.total === 0 ? (
          <p className="workspace-card-copy">
            Nothing automated yet. Flip on review requests, deposit-on-approval, and quote follow-ups in{' '}
            <Link href={`${basePath}/settings#reviews`}>Settings</Link> and this fills in as they run.
          </p>
        ) : (
          <>
            <div className="section-heading workspace-section-heading dash-subheading">
              <p className="eyebrow">Results</p>
              <h3>What they did · last 30 days</h3>
            </div>
            <div className="workspace-metric-grid dash-results-grid">
              <article className="workspace-metric-card accent">
                <span className="workspace-metric-label">Review requests</span>
                <strong className="workspace-metric-value">{automation.reviewCount}</strong>
                <p className="workspace-metric-note">Google reviews asked for automatically.</p>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Quote follow-ups</span>
                <strong className="workspace-metric-value">{automation.followupCount}</strong>
                <p className="workspace-metric-note">Reminders sent on quotes awaiting approval.</p>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Appointment reminders</span>
                <strong className="workspace-metric-value">{automation.reminderCount}</strong>
                <p className="workspace-metric-note">Reminders before scheduled jobs, to cut no-shows.</p>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Deposits requested</span>
                <strong className="workspace-metric-value">{automation.depositCount}</strong>
                <p className="workspace-metric-note">
                  {automation.depositTotal > 0 ? `${formatMoney(automation.depositTotal)} asked on approval.` : 'Auto-requested when a quote is approved.'}
                </p>
              </article>
            </div>
            {automation.recent.length > 0 ? (
              // A log, folded away. It is the only thing on this page that is
              // history rather than something to act on.
              <details className="dash-activity">
                <summary>Recent automation activity ({automation.recent.length})</summary>
                <div className="cost-list" style={{ marginTop: '0.85rem' }}>
                {automation.recent.map((item, index) => {
                  const icon = item.kind === 'review_requested' ? '⭐' : item.kind === 'quote_followup' ? '↻' : item.kind === 'appointment_reminder' ? '🔔' : '$';
                  const when = new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const inner = (
                    <>
                      <div className="cost-item-main">
                        <span className="cost-item-desc">{icon} {item.label}</span>
                        <span className="cost-item-sub">{when}</span>
                      </div>
                      {item.amount ? <span className="cost-item-amount">{formatMoney(item.amount)}</span> : null}
                    </>
                  );
                  return item.jobId ? (
                    <Link href={`${basePath}/jobs/${item.jobId}`} className="cost-item" key={`${item.kind}-${index}`}>{inner}</Link>
                  ) : (
                    <div className="cost-item" key={`${item.kind}-${index}`}>{inner}</div>
                  );
                })}
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>

      <BlogReminderBanner reminderWeeks={blogReminderWeeks} lastPublishedISO={lastPublishedBlogISO} suggestedTopic={blogTopicSuggestion} />
    </main>
  );
}
