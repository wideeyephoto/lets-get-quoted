import Link from 'next/link';
import AutomationLink from '@/components/automation-link';
import InfoTip from '@/components/info-tip';
import { formatJobTime, formatMoney } from '@/lib/jobs';
import type { DashboardHome } from '@/lib/dashboard-home-data';
import { ChecklistTourInvitation } from '@/components/product-tour/ProductTourLauncher';
import BlogReminderBanner from './BlogReminderBanner';
import { extractCity, initials } from '@/lib/dashboard/schedule-loader';

// Additional Command Center Components
import SystemStatusStrip from './home/SystemStatusStrip';
import TodaySchedule from './home/TodaySchedule';
import JobReadiness from './home/JobReadiness';
import CrewStatus from './home/CrewStatus';
import CommunicationsPanel from './home/CommunicationsPanel';
import SalesPipeline from './home/SalesPipeline';
import CashPreview from './home/CashPreview';
import BestNextOpportunity from './home/BestNextOpportunity';

export default function DashboardHomeScreen({
  home,
  basePath = '/dashboard',
  readOnly = false,
}: {
  home: DashboardHome;
  basePath?: string;
  readOnly?: boolean;
}) {
  const {
    connectDisabledAt,
    onboardingComplete,
    onboardingSteps,
    completedStepCount,
    topPriorities,
    restPriorities,
    waitingItems,
    quietDays,
    next7Days,
    todayKey,
    assignmentsByJob,
    crew,
    siteUrl,
    sitePublished,
    bookingSubdomain,
    rebookDue,
    privateFeedback,
    jobsNext7Days,
    reviewsOn,
    followupsOn,
    remindersOn,
    dailyDigestOn,
    automation,
    blogReminderWeeks,
    lastPublishedBlogISO,
    blogTopicSuggestion,
    outstanding,
    openQuotes,
    bookedWork,
    collectedThisMonth,
    collectedMonthLabel,

    // Modular command center data
    alerts,
    todaySchedule,
    pulse,
    pipeline,
    cashPreview,
    readiness,
    crewStatus,
    communications,
    opportunity,
  } = home;

  const priorityCount = topPriorities.length + restPriorities.length;
  const automationsOn = [reviewsOn, followupsOn, remindersOn, dailyDigestOn].filter(Boolean).length;

  return (
    <main className="wide-shell workspace-shell">
      <h1 className="sr-only">Dashboard</h1>

      {/* Critical system alerts */}
      <SystemStatusStrip alerts={alerts} />

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
            Stripe has turned off transfers for your account, so customer deposits and
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
          <ChecklistTourInvitation />
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

      {/* Best next opportunity recommendation */}
      <BestNextOpportunity opportunity={opportunity} />

      {/* ACT NOW — Needs your attention */}
      <section className="panel workspace-section-card priority-panel" data-tour-id="dashboard:needs-attention">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Act now</p>
          <h2>Needs your attention</h2>
        </div>
        {priorityCount > 0 ? (
          <>
            <div className="priority-list">
              {topPriorities.map((item, index) => (
                <Link href={item.href} className="priority-item" key={item.key}>
                  <span className="priority-index">{index + 1}</span>
                  <span className="priority-copy">
                    <strong>
                      {item.label}
                      {item.info ? <InfoTip label={`More information about ${item.label.toLowerCase()}`}>{item.info}</InfoTip> : null}
                    </strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </span>
                  <span className="priority-cta">{item.cta}</span>
                </Link>
              ))}
            </div>
            {restPriorities.length > 0 ? (
              <details className="priority-more">
                <summary>Show {restPriorities.length} more</summary>
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

      {/* WAITING — With your customers */}
      {waitingItems.length > 0 ? (
        <section className="panel workspace-section-card priority-panel dash-waiting">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Waiting</p>
            <h2>With your customers</h2>
          </div>
          <div className="priority-list">
            {waitingItems.map((item) => (
              <Link href={item.href} className="priority-item" key={item.key}>
                <span className="priority-copy">
                  <strong>{item.label}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                </span>
                <span className="priority-cta">{item.cta}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Today's operational timeline */}
      <TodaySchedule schedule={todaySchedule} basePath={basePath} />

      {/* Next 7 days capacity */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">What&apos;s next</p>
          <h2>Next 7 days</h2>
        </div>
        {quietDays.length > 0 && quietDays.length < 7 ? (
          <p className="week-glance-quiet">
            Clear: {quietDays.map((day) => day.shortLabel).join(', ')}
          </p>
        ) : quietDays.length === 7 ? (
          <p className="week-glance-quiet" style={{ display: 'block' }}>
            All 7 days are clear — no jobs scheduled.
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

      {/* Operational checks: Readiness, Crew status & Comms */}
      <JobReadiness readiness={readiness} />
      <CrewStatus crewSummary={crewStatus} basePath={basePath} />
      <CommunicationsPanel communications={communications} basePath={basePath} />

      {/* MONEY — How the business is doing */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Money</p>
          <h2>How the business is doing</h2>
        </div>

        <div className="workspace-metric-grid">
          <Link href={`${basePath}/jobs?owing=1`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article className={`workspace-metric-card${outstanding.total > 0 ? ' accent' : ''}`}>
              <span className="workspace-metric-label">
                Unpaid invoices
                <InfoTip label="More information about unpaid invoices">
                  Invoices sent or signed and not yet settled, counting only what is still owed —
                  deposits and part-payments already collected are deducted.
                </InfoTip>
              </span>
              <strong className="workspace-metric-value">{formatMoney(outstanding.total)}</strong>
              <p className="workspace-metric-note">
                {outstanding.count === 0
                  ? 'Nothing outstanding.'
                  : `across ${outstanding.count} invoice${outstanding.count === 1 ? '' : 's'}`}
              </p>
            </article>
          </Link>

          <Link href={`${basePath}/jobs`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">
                Out for approval
                <InfoTip label="More information about quotes out for approval">
                  Jobs still at the quote stage with a price on them. The same set the
                  &ldquo;awaiting approval&rdquo; row above counts, so the two cannot disagree.
                </InfoTip>
              </span>
              <strong className="workspace-metric-value">{formatMoney(openQuotes.total)}</strong>
              <p className="workspace-metric-note">
                {openQuotes.count === 0 ? 'No open quotes.' : `${openQuotes.count} quote${openQuotes.count === 1 ? '' : 's'}`}
              </p>
            </article>
          </Link>

          <Link href={`${basePath}/schedule`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">
                Booked, next 30 days
                <InfoTip label="More information about booked work">
                  The quoted value of approved work on your calendar in the next 30 days. Work
                  value, not cash — some of it is already paid and some is not due yet. For money
                  in and out by date, see Cash flow.
                </InfoTip>
              </span>
              <strong className="workspace-metric-value">{formatMoney(bookedWork.total)}</strong>
              <p className="workspace-metric-note">
                {bookedWork.count === 0 ? 'Nothing booked yet.' : `${bookedWork.count} job${bookedWork.count === 1 ? '' : 's'} on the calendar`}
              </p>
            </article>
          </Link>

          <Link href={`${basePath}/cash-flow`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">
                Collected in {collectedMonthLabel}
                <InfoTip label="More information about payments collected">
                  Payments received this calendar month, net of refunds. The month is cut in your
                  own timezone, so a payment taken at 5pm on the last day of the month counts in
                  that month.
                </InfoTip>
              </span>
              <strong className="workspace-metric-value">{formatMoney(collectedThisMonth.total)}</strong>
              <p className="workspace-metric-note">
                {collectedThisMonth.count === 0
                  ? 'Nothing collected yet this month.'
                  : `${collectedThisMonth.count} payment${collectedThisMonth.count === 1 ? '' : 's'}`}
              </p>
            </article>
          </Link>

          {pulse.kind === 'ready' ? (
            <Link href={`${basePath}/leads`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">
                  {pulse.data.newLeadsThisMonth.label}
                  <InfoTip label="More information about new leads">
                    {pulse.data.newLeadsThisMonth.tooltip}
                  </InfoTip>
                </span>
                <strong className="workspace-metric-value">{pulse.data.newLeadsThisMonth.formattedValue}</strong>
                <p className="workspace-metric-note">{pulse.data.newLeadsThisMonth.subtitle}</p>
              </article>
            </Link>
          ) : null}
        </div>
      </section>

      {/* Sales Pipeline Funnel & Cash Preview */}
      <SalesPipeline pipeline={pipeline} />
      <CashPreview cashPreview={cashPreview} basePath={basePath} />

      {/* Quick links */}
      {siteUrl || rebookDue > 0 || privateFeedback > 0 || jobsNext7Days > 0 ? (
        <section className="panel workspace-section-card dash-quicklinks">
          <div className="section-heading workspace-section-heading compact-heading">
            <h2>Quick links</h2>
          </div>
          <div className="actions">
            {siteUrl ? (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="btn secondary">
                🚀 Visit your site
              </a>
            ) : null}
            {siteUrl && sitePublished && bookingSubdomain ? (
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
        </section>
      ) : null}

      {/* AUTOMATIONS, COMPRESSED TO ITS ANSWER */}
      <details className="panel workspace-section-card dash-automations" open={automationsOn === 0}>
        <summary className="dash-automations-summary">
          <span className="dash-automations-line">
            <strong>
              {automation.total === 0
                ? 'Automations haven’t run yet'
                : `Automations handled ${automation.total} follow-up${automation.total === 1 ? '' : 's'} in the last 30 days`}
            </strong>
            <span className={`dash-automations-health${automationsOn === 0 ? ' is-off' : ''}`}>
              {automationsOn === 0
                ? 'All switched off'
                : automationsOn === 4
                  ? 'All systems active'
                  : `${automationsOn} of 4 active`}
            </span>
          </span>
        </summary>

        <div className="automation-status-row">
          {readOnly ? (
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
            Nothing automated yet. Turn on review requests, quote follow-ups and appointment
            reminders in <Link href={basePath === '/demo' ? '/demo/settings' : `${basePath}/automations`}>Automations</Link> and this fills
            in as they run.
          </p>
        ) : (
          <>
            <div className="section-heading workspace-section-heading dash-subheading">
              <h3>Automation results · Last 30 days</h3>
            </div>
            <div className="workspace-metric-grid dash-results-grid">
              <article className="workspace-metric-card accent">
                <span className="workspace-metric-label">
                  Review requests
                  <InfoTip label="More information about review requests">
                    Customers automatically asked for a Google review.
                  </InfoTip>
                </span>
                <strong className="workspace-metric-value">{automation.reviewCount}</strong>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">
                  Quote follow-ups
                  <InfoTip label="More information about quote follow-ups">
                    Follow-up texts sent for quotes awaiting approval.
                  </InfoTip>
                </span>
                <strong className="workspace-metric-value">{automation.followupCount}</strong>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">
                  Appointment reminders
                  <InfoTip label="More information about appointment reminders">
                    Appointment reminders sent ahead of scheduled jobs, on the schedule you set.
                  </InfoTip>
                </span>
                <strong className="workspace-metric-value">{automation.reminderCount}</strong>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">
                  Deposits requested
                  <InfoTip label="More information about deposits requested">
                    Deposit requests sent after quote approval.
                  </InfoTip>
                </span>
                <strong className="workspace-metric-value">{automation.depositCount}</strong>
                {automation.depositTotal > 0 ? (
                  <p className="workspace-metric-note">{formatMoney(automation.depositTotal)} asked on approval.</p>
                ) : null}
              </article>
            </div>
            {automation.recent.length > 0 ? (
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
      </details>

      <BlogReminderBanner reminderWeeks={blogReminderWeeks} lastPublishedISO={lastPublishedBlogISO} suggestedTopic={blogTopicSuggestion} />
    </main>
  );
}
