'use client';

import React, { useState, useEffect } from 'react';
import styles from './product-tour.module.css';
import { DASHBOARD_ORIENTATION_TOUR, getTourCopySummary } from '@/lib/product-tour/catalog';
import { dismissTourAction, recordTourEventAction } from '@/app/dashboard/tour-actions';

export function ChecklistTourInvitation({
  allowedStepIds,
  offer = true,
  onStart,
  onDismiss,
}: {
  allowedStepIds?: string[];
  offer?: boolean;
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

  // Emit tour_offered telemetry when the banner actually renders
  useEffect(() => {
    if (dismissed || offer === false) return;
    recordTourEventAction({
      client_event_id: `cl_offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tour_key: DASHBOARD_ORIENTATION_TOUR.key,
      tour_version: DASHBOARD_ORIENTATION_TOUR.version,
      event_type: 'tour_offered',
      source: 'checklist_invitation',
    }).catch(() => {});
  }, [dismissed, offer]);

  if (dismissed || offer === false) return null;

  const { durationText, surfacesText } = getTourCopySummary(allowedStepIds);

  const handleStart = () => {
    if (onStart) {
      onStart();
    } else {
      window.dispatchEvent(new CustomEvent('lgq:start_tour'));
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('lgq_checklist_tour_dismissed', 'true');
    } catch {
      // Ignore
    }
    await dismissTourAction(DASHBOARD_ORIENTATION_TOUR.key, DASHBOARD_ORIENTATION_TOUR.version);
    if (onDismiss) onDismiss();
  };

  return (
    <div className={styles.checklistLauncher} role="region" aria-label="Product Tour Invitation">
      <div className={styles.checklistLauncherCopy}>
        <span className={styles.checklistLauncherTitle}>✨ New here? Take a {durationText} orientation tour</span>
        <span className={styles.checklistLauncherSub}>
          See how {surfacesText} connect together.
        </span>
      </div>
      <div className={styles.checklistLauncherActions}>
        <button
          type="button"
          onClick={handleStart}
          className={styles.launcherStartBtn}
        >
          Take a {durationText} tour &rarr;
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
      title="Restart the dashboard orientation tour"
    >
      🧭 Restart Product Tour
    </button>
  );
}

