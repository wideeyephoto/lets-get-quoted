'use client';

import styles from './neighborhood-halo.module.css';

export default function HaloRouteDiagram() {
  return (
    <div className={styles.storyDiagramRow}>
      {/* Left: Scattered Cold Leads */}
      <div className={styles.storyDiagramBoxBad}>
        <div className={styles.storyDiagramHeader}>
          <span className={styles.storyBadgeBad}>❌ TRADITIONAL COLD INTERNET LEADS</span>
          <strong style={{ color: '#f87171', fontSize: '0.85rem' }}>Fragmented Dispersal</strong>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0.35rem 0 0.75rem' }}>
          3 jobs scattered across 3 zip codes with rush hour highway transit.
        </p>
        <div className={styles.routeVisualStripBad}>
          <div className={styles.routePointBad}>Job #1: North Hills</div>
          <span style={{ color: '#f87171', fontSize: '0.75rem' }}>&rarr; 14.2 mi (35m) &rarr;</span>
          <div className={styles.routePointBad}>Job #2: West End</div>
          <span style={{ color: '#f87171', fontSize: '0.75rem' }}>&rarr; 18.5 mi (42m) &rarr;</span>
          <div className={styles.routePointBad}>Job #3: South Valley</div>
        </div>
        <div className={styles.storyDiagramFooterBad}>
          <span>🛑 77 mins driving</span>
          <span>⛽ \$42 fuel burned</span>
          <span>⏳ 2.5 billable hours lost</span>
        </div>
      </div>

      {/* Right: Same-Street Halo Batch */}
      <div className={styles.storyDiagramBoxGood}>
        <div className={styles.storyDiagramHeader}>
          <span className={styles.storyBadgeGood}>✓ NEIGHBORHOOD HALO CLUSTERS</span>
          <strong style={{ color: '#34d399', fontSize: '0.85rem' }}>Maximum Route Density</strong>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0.35rem 0 0.75rem' }}>
          3 jobs on the same street. Crews and equipment stay parked in 1 spot.
        </p>
        <div className={styles.routeVisualStripGood}>
          <div className={styles.routePointGood}>1428 Maple Ave</div>
          <span style={{ color: '#34d399', fontSize: '0.75rem' }}>&rarr; Walk (100 ft) &rarr;</span>
          <div className={styles.routePointGood}>1436 Maple Ave</div>
          <span style={{ color: '#34d399', fontSize: '0.75rem' }}>&rarr; Walk (80 ft) &rarr;</span>
          <div className={styles.routePointGood}>1442 Maple Ave</div>
        </div>
        <div className={styles.storyDiagramFooterGood}>
          <span>⚡ 0 mins driving</span>
          <span>💰 \$0 extra travel</span>
          <span>🏆 100% billable crew efficiency</span>
        </div>
      </div>
    </div>
  );
}
