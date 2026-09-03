'use client';

import React, { useTransition } from 'react';
import Link from 'next/link';
import { toggleWaitlistAction } from './actions';
import styles from './WaitlistEnableCard.module.css';

export default function WaitlistEnableCard() {
  const [isPending, startTransition] = useTransition();

  const handleEnable = () => {
    startTransition(async () => {
      await toggleWaitlistAction(true);
    });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.breadcrumb}>
        <Link href="/dashboard/schedule" className={styles.breadcrumbLink}>
          ← Back to Schedule
        </Link>
        <span>/</span>
        <span>Cancellation Waitlist</span>
      </div>

      <div className={styles.card}>
        <div className={styles.iconBox} aria-hidden="true">
          ⚡
        </div>

        <div className={styles.badge}>Feature Off by Default</div>
        <h1 className={styles.title}>Cancellation Waitlist is Turned Off</h1>
        <p className={styles.subtitle}>
          Turn on the waitlist to queue customers who want earlier slots and automatically backfill cancellations with priority-ranked SMS offers.
        </p>

        <div className={styles.featuresList}>
          <div className={styles.featureItem}>
            <span className={styles.featureCheck}>✓</span>
            <div className={styles.featureText}>
              <strong>Capture eager leads and flexible clients</strong>
              <span>Queue customers wanting fast work without double-booking your calendar.</span>
            </div>
          </div>

          <div className={styles.featureItem}>
            <span className={styles.featureCheck}>✓</span>
            <div className={styles.featureText}>
              <strong>Priority ranking by distance and urgency</strong>
              <span>When a window opens, the best match nearby receives the first offer.</span>
            </div>
          </div>

          <div className={styles.featureItem}>
            <span className={styles.featureCheck}>✓</span>
            <div className={styles.featureText}>
              <strong>Time-limited holds with auto-cascade</strong>
              <span>If a candidate doesn&apos;t reply in time, the hold expires safely to the next person.</span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleEnable}
            disabled={isPending}
            className={styles.enableBtn}
          >
            <span>⚡</span>
            {isPending ? 'Enabling Waitlist…' : 'Turn On Cancellation Waitlist'}
          </button>

          <Link href="/dashboard/schedule/settings" className={styles.settingsLink}>
            Manage in Schedule Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
