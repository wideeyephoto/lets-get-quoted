import Link from 'next/link';
import type { Loadable, SystemAlertsSummary } from '@/lib/dashboard-types';

export default function SystemStatusStrip({
  alerts,
}: {
  alerts: Loadable<SystemAlertsSummary>;
}) {
  if (alerts.kind !== 'ready' || alerts.data.alerts.length === 0) {
    return null;
  }

  return (
    <section aria-label="System Alerts" className="space-y-3 mb-6">
      {alerts.data.alerts.map((alert) => {
        const isCritical = alert.severity === 'critical';
        const borderColor = isCritical ? 'var(--bad, #dc2626)' : 'var(--warn, #f59e0b)';
        const bg = isCritical ? 'rgba(220, 38, 38, 0.08)' : 'rgba(245, 158, 11, 0.08)';
        const badgeColor = isCritical ? '#dc2626' : '#d97706';

        return (
          <div
            key={alert.id}
            className="panel workspace-section-card"
            style={{
              borderColor,
              background: bg,
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: badgeColor,
                    color: '#ffffff',
                  }}
                >
                  {alert.severity}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  {alert.title}
                </h3>
              </div>
              <Link href={alert.actionHref} className="btn primary" style={{ minHeight: '40px', padding: '0.45rem 1rem' }}>
                {alert.actionLabel}
              </Link>
            </div>
            <p className="workspace-card-copy" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              {alert.description}
            </p>
          </div>
        );
      })}
    </section>
  );
}
