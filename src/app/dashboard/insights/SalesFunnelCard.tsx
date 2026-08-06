import type { Funnel6 } from '@/lib/insights-metrics';

// Six-stage funnel: Leads → Quotes Sent → Quotes Approved → Jobs Scheduled →
// Jobs Completed → Jobs Paid. Each row is a horizontal bar sized to that stage's
// share of the widest stage, its count at the end of the bar, and the share of
// the stage above that reached it.
//
// A server component — pure counts, no interaction. Honest about what it is: this
// is period VOLUME, not a tracked cohort. A lead counted this month need not be
// the record that got paid this month, so a stage's "% of previous" can even top
// 100% (more jobs paid this month than quotes sent this month), and the engine
// leaves that truthful rather than clamping it. The caption says so out loud.

const STAGE_TONE: Record<string, string> = {
  leads: 'is-s0',
  quotes_sent: 'is-s1',
  quotes_approved: 'is-s2',
  jobs_scheduled: 'is-s3',
  jobs_completed: 'is-s4',
  jobs_paid: 'is-s5',
};

export default function SalesFunnelCard({ funnel, windowLabel }: { funnel: Funnel6; windowLabel: string }) {
  // Bars are scaled to the first stage, which is the widest by construction (you
  // can't approve more quotes than you sent this month... except you sometimes
  // can — see above — so guard the width at 100%).
  const top = Math.max(1, funnel.stages[0]?.count ?? 0);

  return (
    <section className="panel ins-card ins-funnel6-card">
      <p className="ins-card-head">
        <span className="ins-chip is-funnel" aria-hidden="true">⧗</span> Sales funnel — {windowLabel}
      </p>

      <div className="ins-funnel6">
        {funnel.stages.map((stage) => {
          const width = Math.min(100, Math.max(stage.count > 0 ? 6 : 0, Math.round((stage.count / top) * 100)));
          const rate = stage.rateOfPrev === null ? null : `${stage.rateOfPrev}%`;
          return (
            <div
              className="ins-funnel6-row"
              key={stage.key}
              aria-label={rate ? `${stage.label}: ${stage.count}, ${rate} of the stage before` : `${stage.label}: ${stage.count}`}
            >
              <span className="ins-funnel6-label">{stage.label}</span>
              <div className="ins-funnel6-track">
                <div className={`ins-funnel6-fill ${STAGE_TONE[stage.key] ?? ''}`} style={{ width: `${width}%` }} />
              </div>
              <strong className="ins-funnel6-count">{stage.count.toLocaleString('en-US')}</strong>
              <span className="ins-funnel6-rate">{rate ?? ''}</span>
            </div>
          );
        })}
      </div>

      <div className="ins-funnel6-foot">
        <span className="ins-figure-label">Overall lead → paid</span>
        <strong>{funnel.overallPct === null ? '—' : `${funnel.overallPct}%`}</strong>
      </div>

      <p className="ins-sub">
        Stage volumes this period, not a tracked cohort — a lead counted here needn&apos;t be the same job that got
        paid here. The right-hand figure is each stage&apos;s share of the one above it.
      </p>
    </section>
  );
}
