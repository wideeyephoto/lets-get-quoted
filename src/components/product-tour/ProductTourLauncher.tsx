'use client';

import { useState, useEffect } from 'react';
import styles from './product-tour.module.css';

export function ChecklistTourInvitation({
  onStart,
  onDismiss,
}: {
  onStart?: () => void;
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('lgq_checklist_tour_dismissed') === 'true') {
        setDismissed(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  if (dismissed) return null;

  const handleStart = () => {
    if (onStart) {
      onStart();
    } else {
      window.dispatchEvent(new CustomEvent('lgq:start_tour'));
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('lgq_checklist_tour_dismissed', 'true');
    } catch {
      // Ignore
    }
    if (onDismiss) onDismiss();
  };

  return (
    <div className={styles.checklistLauncher} role="region" aria-label="Product Tour Invitation">
      <div className={styles.checklistLauncherCopy}>
        <span className={styles.checklistLauncherTitle}>✨ New here? Take a 90-second orientation tour</span>
        <span className={styles.checklistLauncherSub}>
          See how leads, jobs, scheduling, website builder and automations connect together.
        </span>
      </div>
      <div className={styles.checklistLauncherActions}>
        <button
          type="button"
          onClick={handleStart}
          className={styles.launcherStartBtn}
        >
          Take a 90-second tour &rarr;
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className={styles.launcherDismissBtn}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

export function HelpTourRestartButton({
  className,
}: {
  className?: string;
}) {
  const handleRestart = () => {
    window.dispatchEvent(new CustomEvent('lgq:restart_tour'));
  };

  return (
    <button
      type="button"
      onClick={handleRestart}
      className={className ?? styles.primaryBtn}
      title="Restart the 90-second dashboard orientation"
    >
      🧭 Restart Product Tour
    </button>
  );
}
