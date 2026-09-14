'use client';

import React, { useState, useEffect } from 'react';
import type { UniversalPermitApplicationData } from '@/lib/permit-intel/application-generator';
import { generatePermitApplicationHtml } from '@/lib/permit-intel/application-generator';
import SignaturePad from '@/components/signature-pad';
import styles from './PermitApplicationModal.module.css';

export type PermitApplicationModalProps = {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

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
  const [signatureMethod, setSignatureMethod] = useState<'drawn' | 'typed'>('drawn');
  const [signaturePath, setSignaturePath] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !jobId) return;

    let isMounted = true;
    setLoading(true);
    setFeedback(null);

    fetch(`/api/jobs/${jobId}/permits/application`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to compile permit application');
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
          alert('Could not compile permit application packet.');
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
      alert('Pop-up blocked. Please allow pop-ups to print the permit application.');
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

      if (!res.ok) throw new Error('Failed to save draft');
      setFeedback('✓ Application draft saved to Permit Documents!');
      if (onSaved) onSaved();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Could not save application draft.');
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
          <div>
            {feedback && <span className={styles.successNotice}>{feedback}</span>}
          </div>
          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || loading}
              className={styles.secondaryButton}
            >
              {saving ? 'Saving...' : '💾 Save to Job Documents'}
            </button>
            {jobId && (
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
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !html}
              className={styles.primaryButton}
            >
              🖨️ Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
