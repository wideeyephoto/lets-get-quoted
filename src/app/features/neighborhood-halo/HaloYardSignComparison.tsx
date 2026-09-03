'use client';

import styles from './neighborhood-halo.module.css';

export default function HaloYardSignComparison() {
  return (
    <section className="section-block" aria-labelledby="yard-sign-comparison-title" style={{ margin: '56px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '740px', margin: '0 auto 2rem' }}>
        <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ✦ The Evolution of Local Marketing
        </p>
        <h2 id="yard-sign-comparison-title" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.35rem 0 0.75rem', letterSpacing: '-0.02em' }}>
          Why digital halos beat plastic yard signs every time.
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, fontSize: '0.98rem' }}>
          Contractors have spent thousands printing corrugated plastic lawn stakes and paper door flyers.
          Neighborhood Halo replaces physical junk with hyper-targeted micro-ads delivered straight to neighbors&apos; smartphones.
        </p>
      </div>

      <div className={styles.comparisonTableContainer}>
        <table className={styles.comparisonTable}>
          <thead>
            <tr>
              <th scope="col" style={{ width: '28%' }}>Marketing Method</th>
              <th scope="col" style={{ width: '24%' }}>Typical Reach</th>
              <th scope="col" style={{ width: '24%' }}>Cost &amp; Longevity</th>
              <th scope="col" style={{ width: '24%' }}>Downsides &amp; Friction</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style={{ fontWeight: 700, color: '#f1f5f9' }}>🪧 Lawn Yard Signs</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Corrugated plastic stakes</div>
              </td>
              <td>10–25 passing cars</td>
              <td>$15–$25 each &middot; Lasts 48–72 hours</td>
              <td>
                <span className={styles.tableWarning}>HOA fines &middot; Homeowner removes</span>
              </td>
            </tr>
            <tr>
              <td>
                <div style={{ fontWeight: 700, color: '#f1f5f9' }}>🚪 Paper Door Hangers</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Printed flyers on doorknobs</div>
              </td>
              <td>100–250 houses walked</td>
              <td>$350/batch + 4 hours tech labor</td>
              <td>
                <span className={styles.tableWarning}>90% trashed &middot; Rain damage</span>
              </td>
            </tr>
            <tr className={styles.tableHighlightRow}>
              <td>
                <div style={{ fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📍</span> Neighborhood Halo
                </div>
                <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>1-Mile Digital Geofence</div>
              </td>
              <td>
                <strong style={{ color: '#34d399' }}>~1,840 Homeowners</strong>
                <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Direct to phone feed &amp; search</div>
              </td>
              <td>
                <strong style={{ color: '#38bdf8' }}>$25 / 5 Days ($5/day)</strong>
                <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Auto-kills if no engagement</div>
              </td>
              <td>
                <span className={styles.tableSuccess}>✓ 100% HOA-compliant &middot; 0 min drive</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
