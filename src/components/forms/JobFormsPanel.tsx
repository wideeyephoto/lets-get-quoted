'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { FormTemplate, JobFormSubmission } from '@/lib/forms/types';
import styles from './forms.module.css';

const STATUS_BADGE_STYLE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: styles.badgeCategory },
  submitted: { label: 'Submitted', className: styles.badgeCategory },
  passed: { label: 'QA Passed', className: styles.badgePassed },
  completed: { label: 'Signed & Complete', className: styles.badgePassed },
  needs_remediation: { label: 'Needs Remediation', className: styles.badgeNeedsRemediation },
  awaiting_customer_signature: { label: 'Awaiting Customer E-Sign', className: styles.badgeAwaitingSig },
};

export default function JobFormsPanel({
  jobId,
  jobRef,
  clientName,
  initialSubmissions,
  availableTemplates,
  attachFormAction,
  requestSignatureAction,
}: {
  jobId: string;
  jobRef: string;
  clientName: string;
  initialSubmissions: JobFormSubmission[];
  availableTemplates: FormTemplate[];
  attachFormAction: (jobId: string, templateId: string) => Promise<{ success: boolean; submissionId?: string; error?: string }>;
  requestSignatureAction: (jobId: string, submissionId: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [submissions, setSubmissions] = useState<JobFormSubmission[]>(initialSubmissions || []);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(availableTemplates[0]?.id || '');
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAttach() {
    if (!selectedTemplateId) return;
    startTransition(async () => {
      const res = await attachFormAction(jobId, selectedTemplateId);
      if (res.success) {
        setShowAttachModal(false);
        // Page revalidates, but we can also optimize local UI
      }
    });
  }

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '24px',
        marginTop: '24px',
        boxShadow: '0 4px 20px -8px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
            📋 Field Forms, QA &amp; Completion Certificates
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Commissioning checklists, diagnostics, quality inspections, and signed completion certificates for job #{jobRef}.
          </p>
        </div>

        <button
          type="button"
          className="btn primary"
          style={{ fontSize: '0.85rem' }}
          onClick={() => setShowAttachModal(true)}
        >
          + Attach Form / Certificate
        </button>
      </div>

      {/* Submissions List */}
      {submissions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(var(--tint), 0.03)', borderRadius: '8px', border: '1px dashed var(--line)' }}>
          <span style={{ fontSize: '2rem' }}>📑</span>
          <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1rem', color: 'var(--text)' }}>No forms attached to this job yet</h3>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            Attach an HVAC startup, Electrical QA, Plumbing pressure test, or Universal completion certificate.
          </p>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
            onClick={() => setShowAttachModal(true)}
          >
            Attach Preset Checklist
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {submissions.map((sub) => {
            const badge = STATUS_BADGE_STYLE[sub.status] || STATUS_BADGE_STYLE.draft;
            const isExpanded = expandedSubmissionId === sub.id;

            return (
              <div
                key={sub.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '1rem',
                  background: 'var(--bg-elevated)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`${styles.badge} ${badge.className}`}>{badge.label}</span>
                      <span className={`${styles.badge} ${styles.badgeCategory}`}>
                        {sub.templateSnapshot.category.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 style={{ margin: '0.35rem 0 0.15rem', fontSize: '1.05rem', color: 'var(--text)', fontWeight: 600 }}>
                      {sub.templateSnapshot.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {sub.templateSnapshot.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link
                      href={`/dashboard/jobs/${jobId}/forms/${sub.id}/print`}
                      target="_blank"
                      className="btn secondary"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                    >
                      🖨️ Certificate Print View
                    </Link>

                    {sub.templateSnapshot.requireCustomerSignature && !sub.customerSignature && (
                      <button
                        type="button"
                        className="btn primary"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            await requestSignatureAction(jobId, sub.id);
                          });
                        }}
                      >
                        ✍️ Request Client E-Sign
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                      onClick={() => setExpandedSubmissionId(isExpanded ? null : sub.id)}
                    >
                      {isExpanded ? 'Hide Details ▲' : 'View Audit Details ▼'}
                    </button>
                  </div>
                </div>

                {/* Score & Signatures Strip */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--line)', fontSize: '0.8rem' }}>
                  <span>
                    <strong>Score:</strong>{' '}
                    <span style={{ color: sub.summary.compliancePct >= 90 ? 'var(--good, #16a34a)' : 'var(--warn, #ea580c)', fontWeight: 700 }}>
                      {sub.summary.compliancePct}%
                    </span>{' '}
                    ({sub.summary.passedItems} passed, {sub.summary.failedItems} failed)
                  </span>

                  <span>
                    <strong>Technician:</strong>{' '}
                    {sub.techSignature ? `✓ Signed by ${sub.techSignature.name}` : 'Pending Tech Sign-off'}
                  </span>

                  <span>
                    <strong>Customer E-Sign:</strong>{' '}
                    {sub.customerSignature ? (
                      <span style={{ color: 'var(--good, #16a34a)', fontWeight: 600 }}>✓ Accepted by {sub.customerSignature.name}</span>
                    ) : sub.templateSnapshot.requireCustomerSignature ? (
                      <span style={{ color: 'var(--ink-amber-1, #b45309)' }}>⏳ Awaiting Signature</span>
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>

                {/* Critical Issues Warning if any */}
                {sub.summary.criticalIssues.length > 0 && (
                  <div style={{ marginTop: '0.75rem', background: 'rgba(248, 113, 113, 0.12)', padding: '0.6rem 0.85rem', borderRadius: '6px', borderLeft: '4px solid var(--bad, #ef4444)', color: 'var(--ink-red-1, #b91c1c)', fontSize: '0.8rem' }}>
                    <strong>⚠️ Safety / QA Flags:</strong>
                    {sub.summary.criticalIssues.map((msg, i) => (
                      <div key={i}>• {msg}</div>
                    ))}
                  </div>
                )}

                {/* Expanded Inspection Audit Sheet */}
                {isExpanded && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {sub.templateSnapshot.sections.map((sec) => (
                      <div key={sec.id} style={{ background: 'rgba(var(--tint), 0.03)', border: '1px solid var(--line)', padding: '0.75rem', borderRadius: '6px' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text)', fontWeight: 700 }}>
                          {sec.title}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                          {sec.fields.map((f) => {
                            const val = sub.values[f.id];
                            return (
                              <div key={f.id} style={{ background: 'var(--bg-elevated)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--line)', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.75rem' }}>{f.label}</span>
                                <span style={{ fontWeight: 600, color: val === 'pass' ? 'var(--good, #16a34a)' : val === 'fail' ? 'var(--bad, #dc2626)' : 'var(--text)' }}>
                                  {val === 'pass' ? '✓ Pass' : val === 'fail' ? '✕ Fail' : val ? `${val} ${f.unit || ''}` : 'Not recorded'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Attach Modal */}
      {showAttachModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
              Attach Field Form or Certificate
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Select a form template or commissioning checklist to attach to job #{jobRef} for {clientName}.
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Choose Template:
              <select
                className="select"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.category})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowAttachModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={pending || !selectedTemplateId}
                onClick={handleAttach}
              >
                {pending ? 'Attaching...' : 'Attach to Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
