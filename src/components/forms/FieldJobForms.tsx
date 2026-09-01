'use client';

import { useState } from 'react';
import type { JobFormSubmission } from '@/lib/forms/types';
import FieldFormRunner from './FieldFormRunner';
import styles from './forms.module.css';

export default function FieldJobForms({
  submissions: initialSubmissions,
  crewName = 'Field Technician',
  onSaveAction,
}: {
  submissions: JobFormSubmission[];
  crewName?: string;
  onSaveAction: (submission: JobFormSubmission) => Promise<{ success: boolean; error?: string }>;
}) {
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);

  const activeSubmission = initialSubmissions.find((s) => s.id === activeSubmissionId);

  if (activeSubmission) {
    return (
      <FieldFormRunner
        submission={activeSubmission}
        technicianName={crewName}
        onSaveAction={onSaveAction}
        onCancel={() => setActiveSubmissionId(null)}
      />
    );
  }

  if (initialSubmissions.length === 0) {
    return null; // Keep screen clean if no forms assigned
  }

  return (
    <section className="panel" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', padding: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
          📋 Assigned Field Forms & QA ({initialSubmissions.length})
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {initialSubmissions.map((sub) => {
          const isComplete = sub.status === 'completed';
          const isNeedsRemediation = sub.status === 'needs_remediation';
          const isAwaitingSig = sub.status === 'awaiting_customer_signature';

          return (
            <div
              key={sub.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.85rem',
                background: isComplete ? '#f0fdf4' : isNeedsRemediation ? '#fef2f2' : '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <span className={`${styles.badge} ${isComplete ? styles.badgePassed : isNeedsRemediation ? styles.badgeNeedsRemediation : styles.badgeCategory}`}>
                  {isComplete ? '✓ Signed & Complete' : isNeedsRemediation ? '⚠️ Needs Remediation' : isAwaitingSig ? '✍️ Awaiting Customer Sig' : 'Pending Checklist'}
                </span>
                <h4 style={{ margin: '0.3rem 0 0.1rem', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                  {sub.templateSnapshot.title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  {sub.summary.passedItems} passed · {sub.summary.failedItems} failed · {sub.summary.compliancePct}% score
                </p>
              </div>

              <button
                type="button"
                className={isComplete ? 'btn secondary' : 'btn primary'}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem', fontWeight: 600 }}
                onClick={() => setActiveSubmissionId(sub.id)}
              >
                {isComplete ? 'Review / Edit' : '📝 Open & Fill Form'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
