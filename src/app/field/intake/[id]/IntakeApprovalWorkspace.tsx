import React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CircleSlash2, Clock3, ExternalLink, Sparkles } from 'lucide-react';
import styles from './intake-approval.module.css';

export interface CaughtIntakeItem {
  id: string;
  type: 'note' | 'task' | 'cost' | 'lead' | 'schedule' | 'client' | 'crew' | 'change_order';
  title: string;
  subtitle?: string;
  meta?: string;
  status: 'applied' | 'pending' | 'not_applied';
}

interface IntakeApprovalWorkspaceProps {
  rawTranscript: string;
  createdAt: string;
  senderRole: string;
  businessName: string;
  targetJobId?: string | null;
  backHref: string;
  backLabel: string;
  initialItems: CaughtIntakeItem[];
}

const itemStatus = {
  applied: { label: 'Applied', icon: CheckCircle2, color: '#059669' },
  pending: { label: 'Processing', icon: Clock3, color: '#d97706' },
  not_applied: { label: 'No change applied', icon: CircleSlash2, color: '#64748b' },
} as const;

export default function IntakeApprovalWorkspace({
  rawTranscript,
  createdAt,
  senderRole,
  businessName,
  targetJobId,
  backHref,
  backLabel,
  initialItems,
}: IntakeApprovalWorkspaceProps) {
  const overallStatus = initialItems.some((item) => item.status === 'pending')
    ? 'pending'
    : initialItems.every((item) => item.status === 'applied')
      ? 'applied'
      : 'not_applied';
  const overallCopy = overallStatus === 'applied'
    ? 'This field input was already applied. No approval step is required.'
    : overallStatus === 'pending'
      ? 'This field input is still processing. No action is required on this page.'
      : 'The request was recorded, but no business record change was applied.';
  const OverallIcon = itemStatus[overallStatus].icon;
  const resultTone = overallStatus === 'applied'
    ? styles.resultApplied
    : overallStatus === 'pending'
      ? styles.resultPending
      : styles.resultNotApplied;

  return (
    <div className={styles.container}>
      <Link href={backHref} className={styles.backLink}>
        <ArrowLeft size={16} /> {backLabel}
      </Link>

      <div className={styles.headerCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`${styles.badge} ${overallStatus === 'applied' ? styles.badgeSuccess : styles.badgePending}`}>
            <Sparkles size={12} /> {itemStatus[overallStatus].label}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{createdAt}</span>
        </div>

        <h1 className={styles.title}>Field Intake Result</h1>
        <p className={styles.subtitle}>
          Captured for {businessName} from {senderRole} via the Text-to-Job line.
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
        Recorded Result
      </h2>

      <div className={styles.itemsSection}>
        {initialItems.map((item) => {
          const status = itemStatus[item.status];
          const StatusIcon = status.icon;
          return (
            <div key={item.id} className={styles.itemCard}>
              <div className={styles.itemHeader}>
                <span className={styles.itemType}>{item.type.replace('_', ' ')}</span>
                <span style={{ color: status.color, fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <StatusIcon size={14} /> {status.label}
                </span>
              </div>
              <div className={styles.itemContent}>{item.title}</div>
              {item.subtitle && <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.4rem' }}>{item.subtitle}</div>}
              {item.meta && <div className={styles.itemMeta}><span>{item.meta}</span></div>}
            </div>
          );
        })}
      </div>

      <div className={`${styles.resultState} ${resultTone}`}>
        <OverallIcon size={20} /> {overallCopy}
      </div>

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
            View Related Job <ExternalLink size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
