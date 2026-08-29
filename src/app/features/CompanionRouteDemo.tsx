'use client';

import React, { useState } from 'react';
import styles from './features-theme.module.css';

export default function CompanionRouteDemo() {
  const [fee, setFee] = useState<number>(149);
  const [detourMiles, setDetourMiles] = useState<number>(0.8);
  const [isSent, setIsSent] = useState<boolean>(false);

  const extraDriveMinutes = Math.round(detourMiles * 7);

  const handleSendOffer = () => {
    setIsSent(true);
    setTimeout(() => setIsSent(false), 3500);
  };

  return (
    <div className={styles.routeDemoBox} aria-label="Interactive Quick Stop route simulator">
      <div className={styles.routeDemoHeader}>
        <div className={styles.routeDemoStatus}>
          <span className={styles.routePulseDot} aria-hidden="true" />
          <span>ROUTE OPTIMIZER &amp; QUICK STOPS SIMULATOR</span>
        </div>
        <h4>Turn empty drive time into paid same-day revenue</h4>
      </div>

      <div className={styles.routeDemoGrid}>
        {/* Left: Interactive Controls */}
        <div className={styles.routeDemoControls}>
          <div className={styles.routeControlGroup}>
            <div className={styles.routeControlLabel}>
              <span>Your Priority Visit Fee</span>
              <strong>${fee}</strong>
            </div>
            <div className={styles.routeBtnGroup}>
              {[99, 149, 199].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`${styles.routePillBtn} ${fee === val ? styles.routePillActive : ''}`}
                  onClick={() => setFee(val)}
                >
                  ${val}
                </button>
              ))}
            </div>
            <small>Set what you charge for a guaranteed 2-hour arrival window.</small>
          </div>

          <div className={styles.routeControlGroup}>
            <div className={styles.routeControlLabel}>
              <span>Max Route Detour Radius</span>
              <strong>{detourMiles} miles ({extraDriveMinutes} min drive)</strong>
            </div>
            <input
              type="range"
              min="0.3"
              max="3.0"
              step="0.1"
              value={detourMiles}
              onChange={(e) => setDetourMiles(parseFloat(e.target.value))}
              className={styles.routeRangeInput}
              aria-label="Adjust detour radius in miles"
            />
            <div className={styles.routeRangeMarkers}>
              <span>0.3 mi</span>
              <span>1.5 mi</span>
              <span>3.0 mi</span>
            </div>
          </div>

          <div className={styles.routeEarningsCard}>
            <div className={styles.routeEarningsHead}>
              <span>SIMULATED MARGIN IMPACT</span>
              <strong>+${fee} Pure Revenue</strong>
            </div>
            <p>
              Fits directly between Stop 1 and Stop 2. You capture <strong>${fee}</strong> for only{' '}
              <strong>{extraDriveMinutes} added minutes</strong> of driving.
            </p>
          </div>
        </div>

        {/* Right: Visual Route Map + Homeowner Request */}
        <div className={styles.routeVisualStage}>
          <div className={styles.routeMapCard}>
            <div className={styles.routeMapTopBar}>
              <span>📍 Route Active: Woodward Ave Corridor</span>
              <span className={styles.routeMapTag}>2:00 PM Gap Open</span>
            </div>

            {/* Visual Route Path */}
            <div className={styles.routeTimeline}>
              <div className={styles.routeStopNode}>
                <span className={styles.routeNodeNum}>1</span>
                <div>
                  <strong>Stop 1: Main Panel Inspection</strong>
                  <small>10:00 AM - 1:00 PM · Birmingham, MI</small>
                </div>
                <span className={styles.routeNodeDone}>✓ Done</span>
              </div>

              {/* The Quick Stop Insertion */}
              <div className={`${styles.routeStopNode} ${styles.routeQuickStopNode}`}>
                <span className={styles.routeNodePlus}>⚡</span>
                <div>
                  <div className={styles.routeQuickStopBadge}>MATCHED QUICK STOP</div>
                  <strong>Leaking Water Shutoff Valve</strong>
                  <small>Royal Oak · {detourMiles} mi off current route</small>
                </div>
                <div className={styles.routeNodePrice}>${fee}</div>
              </div>

              <div className={styles.routeStopNode}>
                <span className={styles.routeNodeNum}>2</span>
                <div>
                  <strong>Stop 2: Kitchen Recessed Lighting</strong>
                  <small>3:30 PM - 6:00 PM · Ferndale, MI</small>
                </div>
                <span className={styles.routeNodeUpcoming}>Scheduled</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className={styles.routeOfferBar}>
              {isSent ? (
                <div className={styles.routeOfferSuccess}>
                  <span>✓ Priority Offer Sent to Homeowner! (${fee} reserved on Stripe)</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.routeSendOfferBtn}
                  onClick={handleSendOffer}
                >
                  Approve &amp; Send ${fee} Arrival Window Offer <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
            <p className={styles.routeGuaranteeNote}>
              <span>✓</span> Zero auto-booking · The visit only confirms after payment clears.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
