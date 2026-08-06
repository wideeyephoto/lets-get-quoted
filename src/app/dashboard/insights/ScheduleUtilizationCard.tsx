import Link from 'next/link';
import DonutChart from '@/components/donut-chart';
import StartCampaignButton from './StartCampaignButton';
import { formatMoney } from '@/lib/jobs';
import type { ScheduleUtilization } from '@/lib/insights-metrics';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

// How full the calendar is over the booking-availability lookahead (21 days), as
// a booked-vs-open donut with the money the open days could hold. Deliberately a
// DAY-level count — "days that have work" — not "hours filled", because a day
// count is the honest thing an owner can act on from a card, and there's no
// per-day capacity model to divide hours against.
//
// A server component; its only interactive part is the schedule-filler button,
// which is a small client island. The button hands off a draft that was built on
// the server (so the words don't change on arrival) and opens the composer — it
// never sends. When there are no open days there's nothing to fill, so the button
// is replaced by a "fully booked" line rather than shown against a $0 opportunity.

export default function ScheduleUtilizationCard({
  schedule,
  fillDraft,
  basePath = '/dashboard',
  readOnly = false,
}: {
  schedule: ScheduleUtilization;
  fillDraft: CampaignDraft;
  basePath?: string;
  /** The demo has no campaign to start, so the button is not offered. */
  readOnly?: boolean;
}) {
  const { configured, lookaheadDays, workingDays, bookedDays, openDays, utilizationPct, estimatedOpportunity } = schedule;

  return (
    <section className="panel ins-card ins-sched-card">
      <p className="ins-card-head">
        <span className="ins-chip is-sched" aria-hidden="true">◱</span> Schedule utilization
        <span className="ins-card-sub">next {lookaheadDays} days</span>
      </p>

      {!configured ? (
        <p className="ins-empty-note">
          Set your working days and this shows how full your calendar is — booked versus open — for the weeks
          ahead. <Link className="ins-inline-link" href={`${basePath}/schedule`}>Open your schedule →</Link>
        </p>
      ) : workingDays === 0 ? (
        <p className="ins-empty-note">
          Every day in the next {lookaheadDays} days is marked as time off, so there&apos;s no working capacity to
          measure right now.
        </p>
      ) : (
        <>
          <div className="ins-sched-body">
            <DonutChart
              segments={[
                { key: 'booked', color: 'var(--accent)', value: bookedDays },
                { key: 'open', color: 'rgba(var(--tint), 0.3)', value: openDays },
              ]}
              size={148}
              thickness={20}
              centerValue={utilizationPct === null ? '—' : `${utilizationPct}%`}
              centerLabel="booked"
              ariaLabel={`${utilizationPct ?? 0}% of the next ${lookaheadDays} days are booked — ${bookedDays} booked, ${openDays} open.`}
            />

            <div className="ins-sched-legend">
              <div className="ins-sched-key">
                <span className="ins-sched-swatch is-booked" aria-hidden="true" />
                <span className="ins-figure-label">Booked</span>
                <strong>{bookedDays} day{bookedDays === 1 ? '' : 's'}</strong>
              </div>
              <div className="ins-sched-key">
                <span className="ins-sched-swatch is-open" aria-hidden="true" />
                <span className="ins-figure-label">Open</span>
                <strong>{openDays} day{openDays === 1 ? '' : 's'}</strong>
              </div>
              {estimatedOpportunity !== null ? (
                <p className="ins-sched-opp">
                  ≈ <strong>{formatMoney(estimatedOpportunity)}</strong> of work could fit those open days
                  <span className="ins-sub">An estimate at your average job value — a guide, not a forecast.</span>
                </p>
              ) : null}
            </div>
          </div>

          {openDays > 0 && readOnly ? (
            // Read-only (the demo): the same call to action, as a link into the
            // campaigns screen. The button itself stashes a draft in
            // sessionStorage and pushes to a composer a logged-out visitor
            // cannot reach, so offering it would end at /login.
            <Link className="btn primary ins-sched-cta" href={`${basePath}/campaigns`}>
              Fill your open days →
            </Link>
          ) : openDays > 0 ? (
            <StartCampaignButton
              draft={fillDraft}
              className="btn primary ins-sched-cta"
              ariaLabel="Start a schedule-filler campaign to past customers"
            >
              Fill your open days →
            </StartCampaignButton>
          ) : (
            <p className="ins-sub ins-sched-full">
              Every working day in the next {lookaheadDays} days is booked. Nicely done.
            </p>
          )}
        </>
      )}
    </section>
  );
}
