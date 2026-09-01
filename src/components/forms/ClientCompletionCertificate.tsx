'use client';

import { useState, useTransition } from 'react';
import type { JobFormSubmission } from '@/lib/forms/types';
import SignaturePad from '@/components/signature-pad';
import styles from './forms.module.css';

export default function ClientCompletionCertificate({
  token,
  submissions,
  clientName,
  onSignAction,
}: {
  token: string;
  submissions: JobFormSubmission[];
  clientName: string;
  onSignAction: (
    token: string,
    submissionId: string,
    signatureData: { signaturePath: string; signerName: string },
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  // Only show forms that require customer signature or are completed certificates
  const certSubmissions = submissions.filter(
    (s) => s.templateSnapshot.requireCustomerSignature || s.templateSnapshot.category === 'completion_certificate',
  );

  const [activeSubId, setActiveSubId] = useState<string | null>(certSubmissions[0]?.id || null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(clientName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (certSubmissions.length === 0) return null;

  const currentSub = certSubmissions.find((s) => s.id === activeSubId) || certSubmissions[0];
  const isSigned = Boolean(currentSub.customerSignature);
  const template = currentSub.templateSnapshot;

  function handleSign() {
    if (!signaturePath) {
      setError('Please draw your signature in the box below.');
      return;
    }
    if (!signerName.trim()) {
      setError('Please enter your full legal name.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await onSignAction(token, currentSub.id, {
        signaturePath,
        signerName: signerName.trim(),
      });

      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error || 'Failed to submit signature.');
      }
    });
  }

  return (
    <section className="panel workspace-section-card client-completion-certificate" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', marginTop: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      {/* Section Header */}
      <div className="section-heading workspace-section-heading compact-heading" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
        <p className="eyebrow" style={{ color: '#0284c7', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
          Quality Assurance &amp; Handover
        </p>
        <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a', fontWeight: 700 }}>
          📜 Certificate of Completion &amp; Inspection Sign-off
        </h2>
      </div>

      {certSubmissions.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto' }}>
          {certSubmissions.map((sub) => (
            <button
              key={sub.id}
              type="button"
              className={`${styles.pill} ${sub.id === currentSub.id ? styles.pillActive : ''}`}
              onClick={() => {
                setActiveSubId(sub.id);
                setError(null);
                setSuccess(false);
              }}
            >
              {sub.customerSignature ? '✓ ' : '✍️ '} {sub.templateSnapshot.title}
            </button>
          ))}
        </div>
      )}

      {/* Certificate Main Card */}
      <div style={{ border: '2px solid #0284c7', borderRadius: '10px', padding: '1.5rem', background: '#f8fafc', position: 'relative' }}>
        {/* Official Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Official Inspection Record
            </span>
            <h3 style={{ margin: '0.2rem 0', fontSize: '1.2rem', color: '#0c4a6e', fontWeight: 700 }}>
              {template.title}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
              {template.description}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className={`${styles.badge} ${isSigned ? styles.badgePassed : styles.badgeAwaitingSig}`}>
              {isSigned ? '✓ Officially Signed & Accepted' : '⏳ Awaiting Homeowner Sign-off'}
            </span>
            <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
              QA Score: <strong style={{ color: '#16a34a' }}>{currentSub.summary.compliancePct}% Passed</strong>
            </div>
          </div>
        </div>

        {/* Inspection Verification Highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
            Inspected Scope &amp; Quality Checklist
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
            {template.sections.flatMap((s) => s.fields).slice(0, 8).map((field) => {
              const val = currentSub.values[field.id];
              return (
                <div key={field.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#334155', marginRight: '0.5rem' }}>{field.label}</span>
                  <span style={{ fontWeight: 700, color: val === 'pass' ? '#16a34a' : val === 'fail' ? '#dc2626' : '#0f172a' }}>
                    {val === 'pass' ? '✓ Pass' : val === 'fail' ? '✕ Fail' : val ? `${val} ${field.unit || ''}` : '✓ Verified'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Photo Proof Grid if available */}
        {currentSub.photos && currentSub.photos.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
              Verified Work Proof Photos ({currentSub.photos.length})
            </h4>
            <div className={styles.photoThumbGrid}>
              {currentSub.photos.map((p) => (
                <div key={p.id} className={styles.photoThumb}>
                  <img src={p.url || p.path} alt="Completion Proof" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dual Signatures Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem' }}>
          {/* Technician Verification */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Lead Technician Verification
            </span>
            <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
              <strong>{currentSub.techSignature?.name || 'Authorized Field Specialist'}</strong>
              <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                ✓ Certified on {currentSub.techSignature?.signedAt ? new Date(currentSub.techSignature.signedAt).toLocaleDateString() : 'Site Inspection'}
              </div>
            </div>
          </div>

          {/* Customer Sign-off Status / Pad */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Homeowner / Client Acceptance
            </span>

            {isSigned ? (
              <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                <strong style={{ color: '#166534' }}>✓ Signed by {currentSub.customerSignature?.name}</strong>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Recorded on {new Date(currentSub.customerSignature!.signedAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d', fontStyle: 'italic' }}>
                  &quot;{template.customerSignatureDisclaimer || 'I certify that the work described in the contract has been completed to my satisfaction.'}&quot;
                </p>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  Printed Name:
                  <input
                    type="text"
                    className="input"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </label>

                <div className={styles.sigPadWrapper}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                    Sign with your finger or mouse:
                  </span>
                  <SignaturePad onChange={setSignaturePath} label="Homeowner Signature" />
                </div>

                {error && (
                  <div style={{ color: '#b91c1c', fontSize: '0.8rem', fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                {success && (
                  <div style={{ color: '#15803d', fontSize: '0.85rem', fontWeight: 700 }}>
                    ✓ Certificate successfully signed and recorded!
                  </div>
                )}

                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', padding: '0.65rem', fontWeight: 700 }}
                  disabled={pending}
                  onClick={handleSign}
                >
                  {pending ? 'Recording Sign-off...' : '✍️ Authorize & E-Sign Completion Certificate'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
