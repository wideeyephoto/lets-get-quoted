import Link from 'next/link';
import AutomationLink from '@/components/automation-link';
import InfoTip from '@/components/info-tip';
import { formatMoney } from '@/lib/jobs';
import type { getAutomationActivity } from '@/lib/automation-activity';

export default function AutomationHealth({
  automation,
  reviewsOn,
  followupsOn,
  remindersOn,
  dailyDigestOn,
  basePath = '/dashboard',
  readOnly = false,
}: {
  automation: Awaited<ReturnType<typeof getAutomationActivity>>;
  reviewsOn: boolean;
  followupsOn: boolean;
  remindersOn: boolean;
  dailyDigestOn: boolean;
  basePath?: string;
  readOnly?: boolean;
}) {
  const automationsOn = [reviewsOn, followupsOn, remindersOn, dailyDigestOn].filter(Boolean).length;

  return (
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
  );
}
