'use client';

import React, { useState, useEffect } from 'react';
import type { PermitWorkspaceDto } from '@/lib/permit-intel/types';
import styles from './PermitFeasibilityCard.module.css';

export type PermitFeasibilityCardProps = {
  address: string | null | undefined;
  onOpenPermitsTab?: () => void;
  isLead?: boolean;
};

export function PermitFeasibilityCard({
  address,
  onOpenPermitsTab,
  isLead = false,
}: PermitFeasibilityCardProps) {
  const [intel, setIntel] = useState<PermitWorkspaceDto | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(address));

  useEffect(() => {
    if (!address || !address.trim()) {
      setIntel(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    import('@/lib/permit-intel').then(({ getPermitIntelligence }) => {
      getPermitIntelligence({ address })
        .then((dto) => {
          if (isMounted) {
            setIntel(dto);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [address]);

  if (!address || loading) {
    return null;
  }

  if (!intel) {
    return null;
  }

  const { summary, authority, codes, requirement } = intel;

  const pillClass =
    summary.verdict === 'required'
      ? styles.pillRequired
      : summary.verdict === 'not_required'
      ? styles.pillNotRequired
      : styles.pillVerify;

  const primaryCode = codes[0] ? `${codes[0].codeFamily} (${codes[0].editionYear})` : 'Standard Model Codes';

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          <svg
            className={styles.titleIcon}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Permit &amp; Code Feasibility
        </h4>
        <span className={`${styles.pill} ${pillClass}`}>
          {summary.verdict === 'required' && 'Required'}
          {summary.verdict === 'not_required' && 'Not Required'}
          {summary.verdict === 'verify' && 'Verify'}
        </span>
      </div>

      <div className={styles.body}>
        <dl className={styles.details}>
          <div>
            <dt>Enforcing Authority</dt>
            <dd>{authority.name}</dd>
          </div>
          <div>
            <dt>Governing Code</dt>
            <dd>{primaryCode}</dd>
          </div>
          <div>
            <dt>Inspection Department</dt>
            <dd>{authority.department}</dd>
          </div>
          {requirement.estimatedGovernmentFee && (
            <div>
              <dt>Est. Municipal Fee</dt>
              <dd>${requirement.estimatedGovernmentFee.estimatedTotal.toFixed(2)}</dd>
            </div>
          )}
        </dl>

        <div className={styles.actionRow}>
          <span className={styles.muted}>
            {isLead
              ? 'Read-only feasibility · Application available on converted job'
              : 'Full permit workspace available'}
          </span>
          {onOpenPermitsTab && !isLead && (
            <button
              type="button"
              onClick={onOpenPermitsTab}
              className={styles.link}
            >
              View full permits tab →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
