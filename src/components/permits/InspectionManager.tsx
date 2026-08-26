'use client';

import React, { useState } from 'react';
import type { JobPermitInspection } from '@/lib/permit-intel/types';
import styles from './InspectionManager.module.css';

export type InspectionManagerProps = {
  jobId: string;
  inspections: JobPermitInspection[];
  onInspectionUpdated?: () => void;
};

export function InspectionManager({
  jobId,
  inspections: initialInspections,
  onInspectionUpdated,
}: InspectionManagerProps) {
  const [inspections, setInspections] = useState<JobPermitInspection[]>(initialInspections);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [inspectorName, setInspectorName] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Quick result logging state
  const [loggingResultId, setLoggingResultId] = useState<string | null>(null);
  const [resultNotes, setResultNotes] = useState<string>('');

  const handleSaveSchedule = async (inspectionId: string) => {
    if (!scheduledDate) {
      alert('Please pick a date for the inspection.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/inspections/${inspectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          scheduledDate,
          inspectorName: inspectorName || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to schedule');

      setInspections((prev) =>
        prev.map((i) => (i.id === inspectionId ? json.inspection : i)),
      );
      setSchedulingId(null);
      if (onInspectionUpdated) onInspectionUpdated();
    } catch (err) {
      console.error(err);
      alert('Could not save inspection schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogResult = async (inspectionId: string, status: 'passed' | 'failed') => {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/inspections/${inspectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_result',
          status,
          inspectorName: inspectorName || undefined,
          notes: resultNotes || undefined,
          failureReasons: status === 'failed' && resultNotes ? [resultNotes] : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record result');

      setInspections((prev) =>
        prev.map((i) => (i.id === inspectionId ? json.inspection : i)),
      );
      setLoggingResultId(null);
      setResultNotes('');
      if (onInspectionUpdated) onInspectionUpdated();
    } catch (err) {
      console.error(err);
      alert('Could not record inspection result.');
    } finally {
      setSaving(false);
    }
  };

  if (!inspections || inspections.length === 0) {
    return (
      <div style={{ color: '#94a3b8', fontSize: '0.8125rem', padding: '0.75rem 0' }}>
        No municipal inspection milestones initialized.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inspectionList}>
        {inspections.map((insp) => {
          const isScheduling = schedulingId === insp.id;
          const isLogging = loggingResultId === insp.id;

          const badgeClass =
            insp.status === 'passed'
              ? styles.statusPassed
              : insp.status === 'failed'
              ? styles.statusFailed
              : insp.status === 'scheduled'
              ? styles.statusScheduled
              : styles.statusRequired;

          return (
            <div key={insp.id} className={styles.inspectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.titleArea}>
                  <h4 className={styles.inspectionTitle}>{insp.title}</h4>
                  <span className={`${styles.statusBadge} ${badgeClass}`}>
                    {insp.status === 'passed' && '✓ Passed'}
                    {insp.status === 'failed' && '✗ Corrections Required'}
                    {insp.status === 'scheduled' && `● Scheduled (${insp.scheduledDate})`}
                    {insp.status === 'required' && 'Pending Scheduling'}
                  </span>
                </div>
              </div>

              <div className={styles.detailsGrid}>
                {insp.scheduledDate && (
                  <div>
                    Scheduled: <strong>{insp.scheduledDate}</strong>
                  </div>
                )}
                {insp.completedDate && (
                  <div>
                    Completed: <strong>{insp.completedDate}</strong>
                  </div>
                )}
                {insp.inspectorName && (
                  <div>
                    Inspector: <strong>{insp.inspectorName}</strong>
                  </div>
                )}
                {insp.notes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    Notes: <em>{insp.notes}</em>
                  </div>
                )}
              </div>

              {/* Inline Schedule Form */}
              {isScheduling && (
                <div className={styles.formInline}>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className={styles.dateInput}
                  />
                  <input
                    type="text"
                    placeholder="Inspector name (opt)"
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className={styles.textInput}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSchedule(insp.id)}
                    disabled={saving}
                    className={`${styles.button} ${styles.primaryButton}`}
                  >
                    {saving ? 'Saving...' : 'Confirm Date'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedulingId(null)}
                    className={`${styles.button} ${styles.secondaryButton}`}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Inline Result Logging */}
              {isLogging && (
                <div className={styles.formInline}>
                  <input
                    type="text"
                    placeholder="Inspector notes / correction details"
                    value={resultNotes}
                    onChange={(e) => setResultNotes(e.target.value)}
                    className={styles.textInput}
                    style={{ flex: 1, minWidth: '220px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleLogResult(insp.id, 'passed')}
                    disabled={saving}
                    className={`${styles.button} ${styles.passButton}`}
                  >
                    ✓ Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogResult(insp.id, 'failed')}
                    disabled={saving}
                    className={`${styles.button} ${styles.failButton}`}
                  >
                    ✗ Fail / Corrections
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoggingResultId(null)}
                    className={`${styles.button} ${styles.secondaryButton}`}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Action Buttons Row */}
              {!isScheduling && !isLogging && insp.status !== 'passed' && (
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    onClick={() => {
                      setSchedulingId(insp.id);
                      setScheduledDate(insp.scheduledDate || new Date().toISOString().split('T')[0]);
                    }}
                    className={`${styles.button} ${styles.secondaryButton}`}
                  >
                    📅 {insp.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoggingResultId(insp.id);
                      setResultNotes('');
                    }}
                    className={`${styles.button} ${styles.primaryButton}`}
                  >
                    📝 Log Result...
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
