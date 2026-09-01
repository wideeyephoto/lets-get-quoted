'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, RotateCcw, Sparkles, ExternalLink } from 'lucide-react';
import styles from './intake-approval.module.css';

export interface CaughtIntakeItem {
  id: string;
  type: 'note' | 'task' | 'cost' | 'lead' | 'schedule' | 'client' | 'crew' | 'change_order';
  title: string;
  subtitle?: string;
  meta?: string;
  status: 'approved' | 'pending' | 'rejected';
}

interface IntakeApprovalWorkspaceProps {
  intakeId: string;
  rawTranscript: string;
  createdAt: string;
  senderRole: string;
  businessName: string;
  targetJobRef?: string | null;
  targetJobId?: string | null;
  initialItems: CaughtIntakeItem[];
}

export default function IntakeApprovalWorkspace({
  intakeId: _intakeId,
  rawTranscript,
  createdAt,
  senderRole,
  businessName: _businessName,
  targetJobRef,
  targetJobId,
  initialItems,
}: IntakeApprovalWorkspaceProps) {
  const [items, setItems] = useState<CaughtIntakeItem[]>(initialItems);
  const [isApprovedAll, setIsApprovedAll] = useState(false);
  const [isRolledBack, setIsRolledBack] = useState(false);

  const handleApproveAll = () => {
    setItems((prev) => prev.map((item) => ({ ...item, status: 'approved' })));
    setIsApprovedAll(true);
  };

  const handleRollback = () => {
    setIsRolledBack(true);
  };

  return (
    <div className={styles.container}>
      <Link href="/field" className={styles.backLink}>
        <ArrowLeft size={16} /> Back to Field Dashboard
      </Link>

      <div className={styles.headerCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`${styles.badge} ${isApprovedAll ? styles.badgeSuccess : styles.badgePending}`}>
            <Sparkles size={12} /> {isApprovedAll ? 'All Inputs Approved' : 'Review Caught Inputs'}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{createdAt}</span>
        </div>

        <h1 className={styles.title}>
          {targetJobRef ? `Field Update for ${targetJobRef}` : 'Dictated Field Intake'}
        </h1>
        <p className={styles.subtitle}>
          Captured from {senderRole} via Text-to-Job field dictation line.
        </p>

        {rawTranscript && (
          <div className={styles.dictationBubble}>
            <div className={styles.dictationLabel}>
              🎙️ Spoken Dictation / Message
            </div>
            &ldquo;{rawTranscript}&rdquo;
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '1.5rem 0 0.75rem', color: '#1e293b' }}>
        Caught Items ({items.length})
      </h2>

      <div className={styles.itemsSection}>
        {items.map((item) => (
          <div key={item.id} className={styles.itemCard}>
            <div className={styles.itemHeader}>
              <span className={styles.itemType}>{item.type.replace('_', ' ')}</span>
              {item.status === 'approved' ? (
                <span style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={14} /> Approved
                </span>
              ) : (
                <span style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 600 }}>
                  Ready to Approve
                </span>
              )}
            </div>
            <div className={styles.itemContent}>{item.title}</div>
            {item.subtitle && <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.4rem' }}>{item.subtitle}</div>}
            {item.meta && <div className={styles.itemMeta}><span>{item.meta}</span></div>}
          </div>
        ))}
      </div>

      {isRolledBack ? (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '12px', padding: '1rem', textAlign: 'center', fontWeight: 600 }}>
          This dictation was rolled back and removed from the active timeline.
        </div>
      ) : isApprovedAll ? (
        <div className={styles.approvedState}>
          <CheckCircle2 size={20} /> All inputs verified and applied to {targetJobRef || 'records'}.
        </div>
      ) : (
        <div className={styles.actionBar}>
          <button type="button" className={styles.approveBtn} onClick={handleApproveAll}>
            <CheckCircle2 size={18} /> Approve All Inputs
          </button>
          <button
            type="button"
            onClick={handleRollback}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '12px',
              padding: '0.9rem 1.1rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <RotateCcw size={16} /> Undo
          </button>
        </div>
      )}

      {targetJobId && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link
            href={`/dashboard/jobs/${targetJobId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.875rem',
              color: '#ff6a24',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            View Live Job Feed <ExternalLink size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
