import type { SalesActivity } from '@/lib/insights-metrics';

// Six counts from one window: Leads → Quotes sent → Quotes approved → Jobs
// scheduled → Jobs completed → Jobs paid. Each row is a bar sized to that
// stage's share of the widest stage, with its count at the end.
//
// This was "Sales funnel" and carried a conversion percentage per stage plus an
// overall lead → paid. See buildSalesActivity for why those are gone: they were
// ratios of counts that do not belong to each other, and they printed above
// 100% directly under a caption saying this is not a tracked funnel.
//
// A server component — pure counts, no interaction.

const STAGE_TONE: Record<string, string> = {
  leads: 'is-s0',
  quotes_sent: 'is-s1',
  quotes_approved: 'is-s2',
  jobs_scheduled: 'is-s3',
  jobs_completed: 'is-s4',
  jobs_paid: 'is-s5',
};

export default function SalesActivityCard({ activity, windowLabel }: { activity: SalesActivity; windowLabel: string }) {
  // Scaled to the widest stage rather than to the first one. The first stage is
  // usually the largest but is not guaranteed to be — these are independent
  // counts, so more jobs can be paid in a month than leads arrived in it.
  const top = Math.max(1, ...activity.stages.map((stage) => stage.count));

  return (
    <section className="panel ins-card ins-funnel6-card">
      <p className="ins-card-head">
        <span className="ins-chip is-funnel" aria-hidden="true">⧗</span> Sales activity — {windowLabel}
      </p>

      <div className="ins-funnel6">
        {activity.stages.map((stage) => {
          const width = Math.min(100, Math.max(stage.count > 0 ? 6 : 0, Math.round((stage.count / top) * 100)));
          return (
            <div className="ins-funnel6-row" key={stage.key} aria-label={`${stage.label}: ${stage.count}`}>
              <span className="ins-funnel6-label">{stage.label}</span>
              <div className="ins-funnel6-track">
                <div className={`ins-funnel6-fill ${STAGE_TONE[stage.key] ?? ''}`} style={{ width: `${width}%` }} />
              </div>
              <strong className="ins-funnel6-count">{stage.count.toLocaleString('en-US')}</strong>
            </div>
          );
        })}
      </div>

      <p className="ins-sub">
        What happened this period, counted. These are separate totals rather than one group of customers followed
        through — a lead counted here needn&apos;t be the same job that got paid here.
      </p>
    </section>
  );
}
