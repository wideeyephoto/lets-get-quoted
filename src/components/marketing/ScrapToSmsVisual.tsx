'use client';

import styles from './scrap-to-sms-visual.module.css';

export default function ScrapToSmsVisual() {
  return (
    <div className={styles.visualCard}>
      {/* Top: Scrap 2x4 Lumber Note */}
      <div className={styles.lumberSnippet}>
        <div className={styles.snippetHeader}>
          <span className={styles.lumberBadge}>🪵 Traditional: Scrap 2x4 Note</span>
          <span className={styles.lostBadge}>-$350 Unbilled</span>
        </div>
        <div className={styles.woodPlank}>
          <div className={styles.pencilText}>
            Miller: drywall patch + primer $350
            <br />
            Mike drywall Thurs 8am ???
          </div>
          <div className={styles.coffeeRing} aria-hidden="true" />
        </div>
        <div className={styles.lumberOutcome}>
          ⚠️ Forgotten in truck bed by 9:00 PM · Free labor given away
        </div>
      </div>

      {/* Transition Arrow */}
      <div className={styles.transitionBeam}>
        <span className={styles.beamPulse}>⚡ Texted while hands still dirty</span>
        <span className={styles.downArrow} aria-hidden="true">↓</span>
      </div>

      {/* Bottom: Text-to-Job Instant Mobile Sync */}
      <div className={styles.copilotSnippet}>
        <div className={styles.snippetHeader}>
          <span className={styles.copilotBadge}>📱 Text-to-Job Instant Sync</span>
          <span className={styles.capturedBadge}>✓ $350 Billed &amp; Paid</span>
        </div>
        <div className={styles.miniChat}>
          <div className={styles.outgoingBubble}>
            <span>Add $350 drywall patch &amp; primer to Miller job</span>
            <span className={styles.bubbleMeta}>2:14 PM · Delivered</span>
          </div>
          <div className={styles.incomingBubble}>
            <span className={styles.copilotName}>🤖 Copilot AI</span>
            <span>✓ Added $350.00 to Job J-104 (Miller). Invoice updated to $3,570.00.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
