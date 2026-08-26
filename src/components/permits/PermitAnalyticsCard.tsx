'use client';

import React, { useState, useEffect } from 'react';
import type { PermitAnalyticsDto } from '@/lib/permit-intel/permit-analytics';
import styles from './PermitAnalyticsCard.module.css';

export type PermitAnalyticsCardProps = {
  initialAnalytics?: PermitAnalyticsDto | null;
};

export function PermitAnalyticsCard({ initialAnalytics }: PermitAnalyticsCardProps) {
  const [analytics, setAnalytics] = useState<PermitAnalyticsDto | null>(initialAnalytics || null);
  const [loading, setLoading] = useState<boolean>(!initialAnalytics);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (initialAnalytics) {
      setAnalytics(initialAnalytics);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch('/api/contractor/permits/analytics')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not fetch analytics');
        const json = await res.json();
        if (isMounted && json.analytics) {
          setAnalytics(json.analytics);
        }
      })
      .catch((err) => console.warn('Permit analytics load error:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialAnalytics]);

  if (loading) {
    return (
      <div className={styles.container} style={{ opacity: 0.7 }}>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
          Loading municipal turnaround benchmarks...
        </p>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className={styles.container}>
      <div
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>
            <span>📊</span>
            Municipal Turnaround Times &amp; Pipeline Analytics
          </h3>
        </div>
        <span className={styles.toggleIcon}>{isExpanded ? '▲ Collapse' : '▼ Expand'}</span>
      </div>

      {isExpanded && (
        <>
          <div className={styles.grid}>
            <div className={styles.kpiTile}>
              <span className={styles.kpiLabel}>Avg Approval Velocity</span>
              <span className={styles.kpiValue}>
                {analytics.avgApprovalTurnaroundDays} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Days</span>
              </span>
              <span className={styles.kpiSubtext}>Submission to Issuance</span>
            </div>

            <div className={styles.kpiTile}>
              <span className={styles.kpiLabel}>Inspection Pass Rate</span>
              <span className={styles.kpiValue}>
                {analytics.inspectionPassRate}%
              </span>
              <span className={styles.kpiSubtext}>First-time municipal pass</span>
            </div>

            <div className={styles.kpiTile}>
              <span className={styles.kpiLabel}>Active Pipeline</span>
              <span className={styles.kpiValue}>
                {analytics.activePermitsCount} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Active</span>
              </span>
              <span className={styles.kpiSubtext}>{analytics.closedPermitsCount} Closed / Finaled</span>
            </div>

            <div className={styles.kpiTile}>
              <span className={styles.kpiLabel}>Avg Gov Fee</span>
              <span className={styles.kpiValue}>
                ${analytics.avgFeePerPermit}
              </span>
              <span className={styles.kpiSubtext}>${analytics.totalGovernmentFees.toLocaleString()} Total logged</span>
            </div>
          </div>

          <div className={styles.benchmarkSection}>
            <h4 className={styles.benchmarkTitle}>Regional Authority Velocity Benchmarks</h4>
            <div className={styles.benchmarkList}>
              {analytics.regionalBenchmarks.slice(0, 4).map((bench) => (
                <div key={bench.authorityId} className={styles.benchmarkItem}>
                  <span className={styles.benchCity}>{bench.authorityName}</span>
                  <div>
                    <span className={styles.benchDays}>~{bench.avgTurnaroundDays} business days</span>
                    {bench.activePermits > 0 && (
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        ({bench.activePermits} active)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
