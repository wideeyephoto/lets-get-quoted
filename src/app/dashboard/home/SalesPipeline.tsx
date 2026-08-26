import { formatMoney } from '@/lib/jobs';
import type { Loadable, PipelineSummary } from '@/lib/dashboard-types';

export default function SalesPipeline({
  pipeline,
}: {
  pipeline: Loadable<PipelineSummary>;
}) {
  if (pipeline.kind === 'unavailable') {
    return null;
  }

  const { stages, quoteApprovalRatePct, avgJobValue } = pipeline.data;

  return (
    <section className="panel workspace-section-card sales-pipeline-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Sales</p>
          <h2>Activity pipeline</h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
          {quoteApprovalRatePct !== null ? (
            <span>
              Approval rate: <strong style={{ color: 'var(--text)' }}>{quoteApprovalRatePct}%</strong>
            </span>
          ) : null}
          {avgJobValue > 0 ? (
            <span>
              Avg job: <strong style={{ color: 'var(--text)' }}>{formatMoney(avgJobValue)}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem',
          marginTop: '0.5rem',
        }}
      >
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            style={{
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--line, rgba(255,255,255,0.08))',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
            }}
          >
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {idx + 1}. {stage.label}
            </span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--text)' }}>
              {stage.count}
            </strong>
            {stage.value ? (
              <span style={{ fontSize: '0.74rem', color: 'var(--accent)' }}>
                {formatMoney(stage.value)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
