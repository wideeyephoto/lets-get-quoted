'use client';

import React, { useState, useEffect } from 'react';
import type { UniversalPermitApplicationData } from '@/lib/permit-intel/application-generator';
import { generatePermitApplicationHtml } from '@/lib/permit-intel/application-generator';
import SignaturePad from '@/components/signature-pad';
import { CredentialsVaultModal } from './CredentialsVaultModal';
import styles from './PermitApplicationModal.module.css';

export type PermitApplicationModalProps = {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export type MissingFieldInfo = {
  key: string;
  label: string;
  actionType: 'vault' | 'settings' | 'job';
  actionLabel: string;
  href?: string;
};

export function resolveMissingField(field: string, jobId?: string): MissingFieldInfo {
  const normalized = field.trim().toLowerCase();

  if (normalized === 'licensenumber' || normalized.includes('state builder license')) {
    return {
      key: field,
      label: 'State Builder License #',
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (normalized === 'licenseexpiration' || normalized.includes('license expiration')) {
    return {
      key: field,
      label: 'License Expiration Date',
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (
    normalized === 'insurancecarrier' ||
    normalized === 'generalliabilitycarrier' ||
    normalized.includes('general liability insurance carrier') ||
    normalized.includes('general liability carrier')
  ) {
    return {
      key: field,
      label: 'General Liability Insurance Carrier',
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (
    normalized === 'insurancepolicynumber' ||
    normalized === 'generalliabilitypolicynumber' ||
    normalized.includes('general liability policy number')
  ) {
    return {
      key: field,
      label: 'General Liability Policy Number',
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (normalized === 'workerscompcarrier' || normalized.includes("workers' compensation carrier")) {
    return {
      key: field,
      label: "Workers' Compensation Carrier",
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (
    normalized === 'workerscomppolicy' ||
    normalized === 'workerscomppolicynumber' ||
    normalized.includes("workers' compensation policy number")
  ) {
    return {
      key: field,
      label: "Workers' Compensation Policy Number",
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (normalized === 'contactname' || normalized.includes('qualifying licensee')) {
    return {
      key: field,
      label: 'Qualifying Licensee / Contact Name',
      actionType: 'vault',
      actionLabel: 'Credentials Vault ↗',
    };
  }
  if (normalized === 'licensetype' || normalized.includes('license type')) {
    return {
      key: field,
      label: 'License Type',
      actionType: 'settings',
      actionLabel: 'Settings ↗',
      href: '/dashboard/settings#contractor-compliance',
    };
  }
  if (normalized === 'fein' || normalized.includes('federal employer id')) {
    return {
      key: field,
      label: 'Federal Employer ID (FEIN)',
      actionType: 'settings',
      actionLabel: 'Settings ↗',
      href: '/dashboard/settings#contractor-compliance',
    };
  }
  if (
    normalized === 'stateemployernumber' ||
    normalized === 'mescemployernumber' ||
    normalized.includes('state employer')
  ) {
    return {
      key: field,
      label: 'State Employer / MESC #',
      actionType: 'settings',
      actionLabel: 'Settings ↗',
      href: '/dashboard/settings#contractor-compliance',
    };
  }
  if (normalized === 'parcelnumber' || normalized.includes('parcel')) {
    return {
      key: field,
      label: 'Permanent Parcel ID',
      actionType: 'job',
      actionLabel: 'Job Details ↗',
      href: jobId ? `/dashboard/jobs/${jobId}` : '/dashboard/jobs',
    };
  }
  if (normalized === 'ownername' || normalized.includes('owner')) {
    return {
      key: field,
      label: 'Property Owner Name',
      actionType: 'job',
      actionLabel: 'Job Details ↗',
      href: jobId ? `/dashboard/jobs/${jobId}` : '/dashboard/jobs',
    };
  }

  return {
    key: field,
    label: field,
    actionType: 'vault',
    actionLabel: 'Credentials Vault ↗',
  };
}

export function PermitApplicationModal({
  jobId,
  isOpen,
  onClose,
  onSaved,
}: PermitApplicationModalProps) {
  const [data, setData] = useState<UniversalPermitApplicationData | null>(null);
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; missingFields?: string[] } | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<'drawn' | 'typed'>('drawn');
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !jobId) return;

    let isMounted = true;
    setLoading(true);
    setFeedback(null);
    setError(null);

    fetch(`/api/jobs/${jobId}/permits/application`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to compile permit application');
        }
        const json = await res.json();
        if (isMounted) {
          setData(json.data);
          setHtml(json.html);
          if (json.data?.certification?.applicantSignaturePath) {
            setSignaturePath(json.data.certification.applicantSignaturePath);
          }
          if (json.data?.certification?.signatureMethod) {
            setSignatureMethod(json.data.certification.signatureMethod);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) {
          setError({
            message: err instanceof Error ? err.message : 'Could not compile permit application packet.',
          });
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, jobId]);

  const handleSignatureChange = (path: string | null) => {
    setSignaturePath(path);
    if (data) {
      const updatedData: UniversalPermitApplicationData = {
        ...data,
        certification: {
          ...data.certification,
          applicantSignaturePath: path,
          signatureMethod: 'drawn',
        },
      };
      setData(updatedData);
      setHtml(generatePermitApplicationHtml(updatedData));
    }
  };

  const handleSwitchToTyped = () => {
    setSignatureMethod('typed');
    setSignaturePath(null);
    if (data) {
      const updatedData: UniversalPermitApplicationData = {
        ...data,
        certification: {
          ...data.certification,
          applicantSignaturePath: null,
          signatureMethod: 'typed',
        },
      };
      setData(updatedData);
      setHtml(generatePermitApplicationHtml(updatedData));
    }
  };

  const handleSwitchToDrawn = () => {
    setSignatureMethod('drawn');
  };

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!html) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError({ message: 'Pop-up blocked. Please allow pop-ups to print the permit application.' });
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleSaveDraft = async () => {
    if (!jobId || !html) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          data: {
            ...data,
            certification: {
              ...data?.certification,
              applicantSignaturePath: signaturePath,
              signatureMethod,
            },
          },
          signaturePath,
          signatureMethod,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        setError({
          message: errorJson.error || 'Failed to save application draft.',
          missingFields: errorJson.missingFields,
        });
        return;
      }
      setFeedback('✓ Application draft saved to Permit Documents!');
      if (onSaved) onSaved();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error(err);
      setError({
        message: err instanceof Error ? err.message : 'Could not save application draft.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#38bdf8">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Pre-Filled Building Permit Application
          </h3>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              Compiling contractor license, homeowner details, and technical roofing specifications...
            </div>
          ) : (
            <>
              {/* Inline Error & Missing Fields Surface */}
              {(error || (data && !data.readiness?.complete)) && (
                <div className={styles.errorSurface} role="alert">
                  <div className={styles.errorHeader}>
                    <h4 className={styles.errorTitle}>
                      ⚠️ {error?.message ? error.message : `Required Attested Fields Missing (${(error?.missingFields || data?.readiness?.missing || []).length})`}
                    </h4>
                    {error && (
                      <button
                        type="button"
                        onClick={() => setError(null)}
                        className={styles.closeButton}
                        style={{ fontSize: '1rem', padding: '0 4px' }}
                        aria-label="Dismiss error"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className={styles.errorMessage}>
                    To maintain compliance and prevent municipal rejection, permit drafts cannot be saved or exported until all required contractor, insurance, and project fields are provided.
                  </p>
                  {(() => {
                    const missing = error?.missingFields || (!data?.readiness?.complete ? data?.readiness?.missing : []) || [];
                    if (missing.length === 0) return null;
                    return (
                      <div className={styles.checklistGrid}>
                        {missing.map((field) => {
                          const info = resolveMissingField(field, jobId);
                          return (
                            <div key={field} className={styles.checklistItem}>
                              <span className={styles.fieldLabel}>
                                <span style={{ color: '#ef4444' }}>•</span> {info.label}
                              </span>
                              {info.actionType === 'vault' ? (
                                <button
                                  type="button"
                                  className={styles.fixActionBtn}
                                  onClick={() => setIsVaultOpen(true)}
                                >
                                  {info.actionLabel}
                                </button>
                              ) : info.href ? (
                                <a
                                  href={info.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.fixActionLink}
                                >
                                  {info.actionLabel}
                                </a>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div
                className={styles.previewFrame}
                dangerouslySetInnerHTML={{ __html: html }}
              />

              <div className={styles.signatureCard}>
                <div className={styles.signatureCardHeader}>
                  <div className={styles.signatureLabelGroup}>
                    <span className={styles.signatureIcon}>✍️</span>
                    <div>
                      <div className={styles.signatureHeading}>Contractor Signature (Section IV)</div>
                      <div className={styles.signatureSubheading}>
                        Applicant Certification &amp; Compliance under MCL 125.1523a
                      </div>
                    </div>
                  </div>
                  <div className={styles.methodToggle}>
                    <button
                      type="button"
                      onClick={handleSwitchToDrawn}
                      className={signatureMethod === 'drawn' ? styles.methodActive : styles.methodBtn}
                    >
                      ✍️ Sign with Finger / Stylus
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitchToTyped}
                      className={signatureMethod === 'typed' ? styles.methodActive : styles.methodBtn}
                    >
                      ⌨️ Type Name
                    </button>
                  </div>
                </div>

                {signatureMethod === 'drawn' ? (
                  <div className={styles.sigPadContainer}>
                    <SignaturePad
                      onChange={handleSignatureChange}
                      label="Contractor / Authorized Agent Signature"
                      hint="Use your finger, an Apple Pencil / stylus, or your mouse to sign."
                    />
                  </div>
                ) : (
                  <div className={styles.typedContainer}>
                    <span className={styles.typedName}>{data?.applicant.companyName || 'Contractor'}</span>
                    <span className={styles.typedNotice}>Using typed legal company name as signature</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <div style={{ flex: 1 }}>
            {feedback && <span className={styles.successNotice}>{feedback}</span>}
            {data && !data.readiness?.complete && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span>
                  ⚠️ <strong>{data.readiness.missing.length} required field{data.readiness.missing.length > 1 ? 's' : ''} missing</strong>. Draft saving and PDF generation are disabled until resolved.
                </span>
                <button
                  type="button"
                  onClick={() => setIsVaultOpen(true)}
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Open Credentials Vault
                </button>
              </div>
            )}
          </div>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || loading || !data?.readiness?.complete}
              title={!data?.readiness?.complete ? 'Save Draft disabled: complete required fields to save draft' : undefined}
              className={styles.secondaryButton}
              style={!data?.readiness?.complete ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {saving ? 'Saving...' : '💾 Save to Job Documents'}
            </button>
            {jobId && (
              data?.readiness?.complete ? (
                <a
                  href={
                    signaturePath
                      ? `/api/jobs/${jobId}/permits/pdf?sig=${encodeURIComponent(signaturePath)}`
                      : `/api/jobs/${jobId}/permits/pdf`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.secondaryButton}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  📥 Download PDF File
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="PDF download disabled: complete required fields to download PDF"
                  className={styles.secondaryButton}
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  📥 Download PDF File
                </button>
              )
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !html || !data?.readiness?.complete}
              title={!data?.readiness?.complete ? 'Print disabled: complete required fields to print' : undefined}
              className={styles.primaryButton}
              style={!data?.readiness?.complete ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              🖨️ Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      {isVaultOpen && (
        <CredentialsVaultModal
          isOpen={isVaultOpen}
          onClose={() => {
            setIsVaultOpen(false);
            if (jobId) {
              setError(null);
              fetch(`/api/jobs/${jobId}/permits/application`)
                .then((res) => (res.ok ? res.json() : null))
                .then((json) => {
                  if (json?.data) {
                    setData(json.data);
                    setHtml(json.html);
                  }
                })
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}
