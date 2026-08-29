'use client';

import styles from './scrap-lumber-comparison.module.css';

export default function ScrapLumberComparison() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <span className={styles.eyebrow}>Before &amp; After Comparison</span>
        <h3 className={styles.title}>The most expensive notes are the ones written on scrap 2x4s.</h3>
        <p className={styles.subtitle}>
          Contractors lose an average of $1,500/month in unbilled change orders, forgot-to-log labor,
          and misplaced supply receipts. Here is what happens when you switch to Text-to-Job.
        </p>
      </div>

      <div className={styles.comparisonDeck}>
        {/* Left: Scrap Lumber Note */}
        <div className={styles.lumberCard}>
          <div className={styles.lumberHead}>
            <span className={styles.lumberBadge}>❌ Traditional: Scrap 2x4 &amp; Memory</span>
            <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 800 }}>
              -$1,500/mo Lost
            </span>
          </div>

          <div className={styles.lumberWoodBlock}>
            <p className={styles.scribbleText}>
              Miller 124 Main:
              <br />
              - 4 sheets CDX plywood ($320)
              <br />
              - extra 12/2 romex line ($450)
              <br />- Mike drywall Thurs 8am ???
            </p>
            <div className={styles.coffeeStain} />
          </div>

          <ul className={styles.lumberWarningsList}>
            <li className={styles.lumberWarningItem}>
              <span>⚠️</span>
              <span>
                <strong>Forgotten by 9:00 PM:</strong> Note gets thrown in the truck bed or tossed in
                the dumpster.
              </span>
            </li>
            <li className={styles.lumberWarningItem}>
              <span>⚠️</span>
              <span>
                <strong>Unbilled Change Orders:</strong> Homeowner gets free materials because the math
                was never added to the invoice.
              </span>
            </li>
            <li className={styles.lumberWarningItem}>
              <span>⚠️</span>
              <span>
                <strong>Crew Confusion:</strong> Mike has no idea what time to arrive on Thursday or
                where the gate code is.
              </span>
            </li>
          </ul>
        </div>

        {/* Right: Text-to-Job */}
        <div className={styles.textToJobCard}>
          <div className={styles.ttjHead}>
            <span className={styles.ttjBadge}>✅ Let’s Get Quoted: Text-to-Job</span>
            <span style={{ fontSize: '11px', color: '#50e3bd', fontWeight: 800 }}>
              100% Captured &amp; Paid
            </span>
          </div>

          <div className={styles.ttjPreviewBlock}>
            <div className={styles.ttjJobHeader}>
              <span className={styles.ttjJobRef}>Job J-104 · Miller Residence</span>
              <span className={styles.ttjJobStatus}>✓ Quote Updated &amp; Sent</span>
            </div>

            <div className={styles.ttjLineItem}>
              <span>4 Sheets 1/2" CDX Plywood + Romex Line</span>
              <strong>+$770.00</strong>
            </div>

            <div className={styles.ttjLineTotal}>
              <span>New Invoice Total (Stripe Link Active):</span>
              <span>$3,570.00</span>
            </div>
          </div>

          <ul className={styles.ttjBenefitsList}>
            <li className={styles.ttjBenefitItem}>
              <span className={styles.checkIcon}>✓</span>
              <span>
                <strong>Instant Math &amp; Client Link:</strong> Total recalculated and 1-tap SMS
                approval link queued to Dave Miller.
              </span>
            </li>
            <li className={styles.ttjBenefitItem}>
              <span className={styles.checkIcon}>✓</span>
              <span>
                <strong>Live Crew Task:</strong> Drywall task automatically placed on Mike’s field
                app schedule for Thursday 8:00 AM.
              </span>
            </li>
            <li className={styles.ttjBenefitItem}>
              <span className={styles.checkIcon}>✓</span>
              <span>
                <strong>Hands Clean, Job Done:</strong> All logged via 1 voice memo from the cab of
                the truck before leaving the driveway.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
