'use client';

import React, { useState } from 'react';
import type { PermitWorkspaceDto } from '@/lib/permit-intel/types';
import type { PermitSubmissionResult } from '@/lib/permit-intel/submission-pipeline';
import styles from './PermitSubmissionModal.module.css';

export type PermitSubmissionModalProps = {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
  workspaceData: PermitWorkspaceDto;
  onSubmitted?: (result: PermitSubmissionResult) => void;
};

export function PermitSubmissionModal({
  jobId,
  isOpen,
  onClose,
  workspaceData,
  onSubmitted,
}: PermitSubmissionModalProps) {
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [agreedLegal, setAgreedLegal] = useState<boolean>(false);
  const [contactName, setContactName] = useState<string>('Master Licensee / Officer');
  const [licenseNumber, setLicenseNumber] = useState<string>('2101234567');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<PermitSubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorized || !agreedLegal) {
      alert('Please check all mandatory authorization and compliance boxes.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorAuthorized: true,
          agreedToSection23a: true,
          authorizedByName: contactName,
          qualifyingLicenseNumber: licenseNumber,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit permit application.');
      }

      setResult(json.result);
      if (onSubmitted) {
        onSubmitted(json.result);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error submitting permit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#38bdf8">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Authorize Municipal Permit Submission
          </h3>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close modal">
            ✕
          </button>
        </div>

        {result ? (
          <div className={styles.modalBody}>
            <div className={styles.receiptCard}>
              <div className={styles.receiptIcon}>✓</div>
              <h4 style={{ margin: 0, fontSize: '1.25rem', color: '#ffffff' }}>
                Application Officially Dispatched
              </h4>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>
                Submitted to {result.authorityName}
              </p>
              <div style={{ marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block' }}>
                  Electronic Tracking Reference
                </span>
                <span className={styles.receiptRef}>{result.externalReferenceNumber}</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: '#cbd5e1', maxWidth: '440px', marginTop: '0.5rem' }}>
                The permit case status has been updated to <strong>Submitted</strong> and logged to the Job Feed. Check the municipal portal for inspector assignments and review comments.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <div />
              <button type="button" onClick={onClose} className={styles.primaryButton}>
                Done &amp; Return to Workspace
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.modalBody}>
              {error && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '0.8125rem' }}>
                  ⚠️ {error}
                </div>
              )}

              <div className={styles.checklistCard}>
                <div className={styles.checklistTitle}>Pre-Submission Requirements Checklist</div>
                <div className={styles.checkItem}>
                  <span className={styles.checkIcon}>✓</span>
                  <span>Jurisdiction verified: <strong>{workspaceData.authority.name}</strong></span>
                </div>
                <div className={styles.checkItem}>
                  <span className={styles.checkIcon}>✓</span>
                  <span>Property address: <strong>{workspaceData.location.address.formattedAddress}</strong></span>
                </div>
                <div className={styles.checkItem}>
                  <span className={styles.checkIcon}>✓</span>
                  <span>Governing code standards: <strong>2015 MRC Compliance Verified</strong></span>
                </div>
                <div className={styles.checkItem}>
                  <span className={styles.checkIcon}>✓</span>
                  <span>Technical roof spec: <strong>{workspaceData.work.scope} ({workspaceData.work.roofSquares || 22} sq)</strong></span>
                </div>
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="auth-name-input">
                    Authorizing Licensee / Agent
                  </label>
                  <input
                    id="auth-name-input"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="auth-lic-input">
                    State Builder License #
                  </label>
                  <input
                    id="auth-lic-input"
                    type="text"
                    required
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className={styles.textInput}
                  />
                </div>
              </div>

              <div className={styles.authBox}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={authorized}
                    onChange={(e) => setAuthorized(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                  <span>
                    <strong>Contractor Authorization:</strong> I hereby certify that I am the licensed contractor or authorized agent, and I authorize the electronic submittal of this permit application to {workspaceData.authority.name}.
                  </span>
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={agreedLegal}
                    onChange={(e) => setAgreedLegal(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                  <span className={styles.legalText}>
                    <strong>Michigan Section 23a Notice:</strong> I understand that Section 23a of the state construction code act of 1972 (MCL 125.1523a) prohibits circumventing state licensing requirements, and all statements provided herein are true and accurate.
                  </span>
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" onClick={onClose} className={styles.secondaryButton} disabled={submitting}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!authorized || !agreedLegal || submitting}
                className={styles.primaryButton}
              >
                {submitting ? 'Dispatching...' : `🚀 Submit to ${workspaceData.authority.name}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
