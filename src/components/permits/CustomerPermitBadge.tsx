'use client';

import React, { useState, useEffect } from 'react';
import type { CustomerPermitSummaryDto } from '@/lib/permit-intel/customer-portal';
import styles from './CustomerPermitBadge.module.css';

export type CustomerPermitBadgeProps = {
  jobId: string;
  initialSummary?: CustomerPermitSummaryDto | null;
};

export function CustomerPermitBadge({
  jobId,
  initialSummary,
}: CustomerPermitBadgeProps) {
  const [summary, setSummary] = useState<CustomerPermitSummaryDto | null>(initialSummary || null);
  const [loading, setLoading] = useState<boolean>(!initialSummary);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (initialSummary) {
      setSummary(initialSummary);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch(`/api/jobs/${jobId}/permits/customer`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load permit status');
        const json = await res.json();
        if (isMounted && json.summary) {
          setSummary(json.summary);
        }
      })
      .catch((err) => console.warn('Permit badge load error:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [jobId, initialSummary]);

  if (loading) {
    return (
      <div className={styles.container} style={{ opacity: 0.7 }}>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
          Checking municipal permit status...
        </p>
      </div>
    );
  }

  if (!summary) return null;

  const isIssuedOrPassed = ['issued', 'inspections', 'completed'].includes(summary.stage);
  const badgeClass =
    summary.stage === 'not_required'
      ? styles.badgeExempt
      : isIssuedOrPassed
      ? styles.badgeIssued
      : styles.badgePending;

  const progressPercent = Math.min(
    100,
    Math.max(10, (summary.stageIndex / summary.totalStages) * 100),
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={`${styles.badge} ${badgeClass}`}>
          {isIssuedOrPassed && '● '}
          {summary.statusBadge}
        </span>
        <span className={styles.authorityTag}>
          🏛️ {summary.authorityName}
        </span>
      </div>

      <div className={styles.titleArea}>
        <h4 className={styles.title}>{summary.headline}</h4>
        <p className={styles.description}>{summary.description}</p>
      </div>

      {summary.stage !== 'not_required' && (
        <div className={styles.progressTrack} aria-label="Permit Progress">
          <div
            className={styles.progressBar}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {summary.milestones.length > 0 && (
        <div className={styles.milestonesList}>
          {summary.milestones.slice(0, expanded ? undefined : 3).map((m) => (
            <div key={m.id} className={styles.milestoneItem}>
              <div className={styles.milestoneLeft}>
                <span
                  className={
                    m.status === 'completed'
                      ? styles.milestoneDotDone
                      : m.status === 'current'
                      ? styles.milestoneDotCurrent
                      : styles.milestoneDotPending
                  }
                />
                <span style={{ color: m.status === 'pending' ? '#94a3b8' : '#f1f5f9' }}>
                  {m.title}
                </span>
              </div>
              {m.notes && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{m.notes}</span>}
            </div>
          ))}

          {summary.milestones.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '0.2rem 0',
              }}
            >
              {expanded ? '▲ Show less' : `▼ View all ${summary.milestones.length} milestones`}
            </button>
          )}
        </div>
      )}

      <div className={styles.footerRow}>
        <div>
          {summary.permitNumber ? (
            <span className={styles.permitNumberText}>
              Permit #{summary.permitNumber}
            </span>
          ) : (
            <span style={{ color: '#94a3b8' }}>Municipal Compliance Tracking</span>
          )}
        </div>

        {summary.verificationUrl && (
          <a
            href={summary.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.verifyLink}
          >
            Verify with City ↗
          </a>
        )}
      </div>
    </div>
  );
}
