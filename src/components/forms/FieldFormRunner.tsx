'use client';

import { useState, useTransition } from 'react';
import type { JobFormSubmission } from '@/lib/forms/types';
import {
  calculateFormCompliance,
  resolveFormState,
  validateSubmission,
} from '@/lib/forms/conditional-engine';
import SignaturePad from '@/components/signature-pad';
import styles from './forms.module.css';

export default function FieldFormRunner({
  submission: initialSubmission,
  technicianName = 'Field Technician',
  onSaveAction,
  onCancel,
}: {
  submission: JobFormSubmission;
  technicianName?: string;
  onSaveAction: (submission: JobFormSubmission) => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
}) {
  const [submission, setSubmission] = useState<JobFormSubmission>(initialSubmission);
  const [values, setValues] = useState<Record<string, any>>(initialSubmission.values || {});
  const [photos, setPhotos] = useState(initialSubmission.photos || []);

  const [techSignPath, setTechSignPath] = useState<string | null>(initialSubmission.techSignature?.path || null);
  const [techName, setTechName] = useState(initialSubmission.techSignature?.name || technicianName);

  const [customerSignPath, setCustomerSignPath] = useState<string | null>(initialSubmission.customerSignature?.path || null);
  const [customerName, setCustomerName] = useState(initialSubmission.customerSignature?.name || '');

  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const template = submission.templateSnapshot;
  const state = resolveFormState(template, values);
  const compliance = calculateFormCompliance(template, values);

  function handleFieldValueChange(fieldId: string, value: any) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  function handlePhotoAdd(fieldId: string) {
    // Simulated camera capture / photo upload with timestamp
    const now = new Date().toISOString();
    const newPhoto = {
      id: `photo_${Date.now()}`,
      fieldId,
      path: `field-photos/${submission.jobId}/${Date.now()}.jpg`,
      url: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=400&q=80',
      caption: `Job site photo for field check`,
      timestamp: now,
    };
    setPhotos((prev) => [...prev, newPhoto]);
  }

  function handleSubmit(isFinal: boolean) {
    setErrorMessage(null);
    setSuccessMessage(null);

    const now = new Date().toISOString();

    const techSignature = techSignPath
      ? {
          path: techSignPath,
          name: techName,
          title: 'Field Lead / Technician',
          signedAt: now,
        }
      : submission.techSignature;

    const customerSignature = customerSignPath
      ? {
          path: customerSignPath,
          name: customerName,
          title: 'Homeowner / Authorized Client',
          signedAt: now,
        }
      : submission.customerSignature;

    if (isFinal) {
      const validation = validateSubmission(template, values, {
        hasTechSig: Boolean(techSignature),
        hasCustomerSig: Boolean(customerSignature) || !template.requireCustomerSignature,
      });

      if (!validation.isValid) {
        setErrorMessage(`Please resolve remaining items: ${validation.errors.join(' ')}`);
        return;
      }
    }

    const updated: JobFormSubmission = {
      ...submission,
      values,
      photos,
      techSignature: techSignature || null,
      customerSignature: customerSignature || null,
      status: isFinal
        ? template.requireCustomerSignature && !customerSignature
          ? 'awaiting_customer_signature'
          : compliance.isCompliant
            ? 'completed'
            : 'needs_remediation'
        : 'draft',
      submittedAt: isFinal ? now : submission.submittedAt,
      customerSignedAt: customerSignature ? now : submission.customerSignedAt,
    };

    startTransition(async () => {
      const res = await onSaveAction(updated);
      if (res.success) {
        setSubmission(updated);
        setSuccessMessage(isFinal ? '✓ Form successfully submitted & logged!' : '✓ Draft saved.');
        if (isFinal && onCancel) {
          setTimeout(() => onCancel(), 2000);
        }
      } else {
        setErrorMessage(res.error || 'Failed to save form.');
      }
    });
  }

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
      {/* Runner Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '1rem' }}>
        <div>
          <span className={`${styles.badge} ${styles.badgeCategory}`}>
            {template.trade !== 'all' ? `${template.trade.toUpperCase()} · ` : ''}
            {template.category.replace('_', ' ')}
          </span>
          <h2 style={{ margin: '0.35rem 0 0.15rem', fontSize: '1.2rem', color: 'var(--text)', fontWeight: 700 }}>
            {template.title}
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            {template.description}
          </p>
        </div>

        {onCancel && (
          <button type="button" className="btn secondary" style={{ fontSize: '0.8rem' }} onClick={onCancel}>
            ✕ Close
          </button>
        )}
      </div>

      {/* Compliance Bar */}
      <div className={styles.scorecard}>
        <div className={styles.scoreItem}>
          <strong style={{ color: compliance.compliancePct >= 90 ? 'var(--good, #16a34a)' : 'var(--warn, #ea580c)' }}>
            {compliance.compliancePct}%
          </strong>
          <span>Score</span>
        </div>
        <div className={styles.scoreItem}>
          <strong style={{ color: 'var(--good, #16a34a)' }}>{compliance.passedItems}</strong>
          <span>Passed</span>
        </div>
        <div className={styles.scoreItem}>
          <strong style={{ color: compliance.failedItems > 0 ? 'var(--bad, #dc2626)' : 'var(--muted-2, #64748b)' }}>
            {compliance.failedItems}
          </strong>
          <span>Failed</span>
        </div>
        <div className={styles.scoreItem}>
          <strong>{compliance.unresolvedRequiredCount}</strong>
          <span>Open Items</span>
        </div>
      </div>

      {/* Critical Warnings */}
      {compliance.criticalIssues.length > 0 && (
        <div className={styles.criticalAlert}>
          <strong>⚠️ Active Safety &amp; QA Flags:</strong>
          {compliance.criticalIssues.map((issue, idx) => (
            <div key={idx}>• {issue}</div>
          ))}
        </div>
      )}

      {/* Form Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {template.sections.map((sec) => {
          const visibleFields = sec.fields.filter((f) => state.visibleFieldIds.has(f.id));
          if (visibleFields.length === 0) return null;

          return (
            <div key={sec.id} style={{ background: 'rgba(var(--tint), 0.03)', border: '1px solid var(--line)', borderRadius: '10px', padding: '1rem' }}>
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--text)', fontWeight: 700 }}>
                {sec.title}
              </h3>
              {sec.description && (
                <p style={{ margin: '0 0 0.85rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {sec.description}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {visibleFields.map((field) => {
                  const isRequired = state.requiredFieldIds.has(field.id);
                  const currentVal = values[field.id];
                  const fieldPhotos = photos.filter((p) => p.fieldId === field.id);

                  return (
                    <div key={field.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.85rem' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.45rem' }}>
                        <span>
                          {field.label} {isRequired && <span style={{ color: 'var(--bad, #ef4444)' }}>*</span>}
                        </span>
                        {field.unit && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Unit: {field.unit}</span>}
                      </label>

                      {field.helpText && (
                        <p style={{ margin: '0 0 0.45rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {field.helpText}
                        </p>
                      )}

                      {/* Pass/Fail/NA Buttons */}
                      {field.type === 'pass_fail_na' && (
                        <div className={styles.passFailGroup} style={{ width: '100%' }}>
                          <button
                            type="button"
                            className={`${styles.passFailBtn} ${currentVal === 'pass' ? styles.passActive : ''}`}
                            style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.9rem' }}
                            onClick={() => handleFieldValueChange(field.id, 'pass')}
                          >
                            ✓ Pass
                          </button>
                          <button
                            type="button"
                            className={`${styles.passFailBtn} ${currentVal === 'fail' ? styles.failActive : ''}`}
                            style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.9rem' }}
                            onClick={() => handleFieldValueChange(field.id, 'fail')}
                          >
                            ✕ Fail
                          </button>
                          <button
                            type="button"
                            className={`${styles.passFailBtn} ${currentVal === 'na' ? styles.naActive : ''}`}
                            style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.9rem' }}
                            onClick={() => handleFieldValueChange(field.id, 'na')}
                          >
                            N/A
                          </button>
                        </div>
                      )}

                      {/* Measurement Number */}
                      {field.type === 'number' && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="number"
                            step={field.step || 'any'}
                            placeholder={field.placeholder || '0.00'}
                            className="input"
                            style={{ flex: 1, fontSize: '1rem', padding: '0.5rem' }}
                            value={currentVal ?? ''}
                            onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                          />
                          {field.unit && (
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', minWidth: '40px' }}>
                              {field.unit}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Text */}
                      {field.type === 'text' && (
                        <input
                          type="text"
                          placeholder={field.placeholder || ''}
                          className="input"
                          style={{ fontSize: '0.9rem', padding: '0.5rem' }}
                          value={currentVal ?? ''}
                          onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                        />
                      )}

                      {/* Textarea */}
                      {field.type === 'textarea' && (
                        <textarea
                          rows={3}
                          placeholder={field.placeholder || 'Enter notes...'}
                          className="input"
                          style={{ fontSize: '0.88rem', padding: '0.5rem' }}
                          value={currentVal ?? ''}
                          onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                        />
                      )}

                      {/* Dropdown Select */}
                      {field.type === 'select' && (
                        <select
                          aria-label={field.label || 'Select option'}
                          className="select"
                          style={{ fontSize: '0.9rem', padding: '0.5rem' }}
                          value={currentVal ?? ''}
                          onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                        >
                          <option value="">-- Select option --</option>
                          {field.options?.map((opt, i) => (
                            <option key={i} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Radio */}
                      {field.type === 'radio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {field.options?.map((opt, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={field.id}
                                checked={currentVal === opt}
                                onChange={() => handleFieldValueChange(field.id, opt)}
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Photo Capture */}
                      {field.type === 'photo' && (
                        <div>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'center', padding: '0.6rem' }}
                            onClick={() => handlePhotoAdd(field.id)}
                          >
                            📷 Take / Attach Job Photo
                          </button>

                          {fieldPhotos.length > 0 && (
                            <div className={styles.photoThumbGrid}>
                              {fieldPhotos.map((photo) => (
                                <div key={photo.id} className={styles.photoThumb}>
                                  <img src={photo.url || photo.path} alt="Checklist proof" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Scale (1-5) */}
                      {field.type === 'scale' && (
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              className={styles.pill}
                              style={{
                                flex: 1,
                                padding: '0.5rem 0',
                                fontSize: '1rem',
                                background: (currentVal || 5) >= star ? 'rgba(251, 191, 36, 0.2)' : 'rgba(var(--tint), 0.04)',
                                color: (currentVal || 5) >= star ? 'var(--ink-amber-1, #b45309)' : 'var(--muted)',
                                border: '1px solid ' + ((currentVal || 5) >= star ? 'rgba(251, 191, 36, 0.35)' : 'var(--line)'),
                              }}
                              onClick={() => handleFieldValueChange(field.id, star)}
                            >
                              ⭐ {star}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Technician Digital Sign-off */}
      {template.requireTechSignature && (
        <div style={{ background: 'rgba(var(--tint), 0.03)', border: '1px solid var(--line)', borderRadius: '10px', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--text)', fontWeight: 700 }}>
            👷 Lead Technician Sign-off
          </h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            I certify that I have conducted and inspected all items in this report.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Printed Name:
              <input
                type="text"
                className="input"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
              />
            </label>

            <div className={styles.sigPadWrapper}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Draw Technician Signature:</span>
              <SignaturePad onChange={setTechSignPath} label="Technician Signature" />
            </div>
          </div>
        </div>
      )}

      {/* On-Site Customer Handover E-Sign */}
      {template.requireCustomerSignature && (
        <div style={{ background: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.25)', borderRadius: '10px', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--ink-green-1, #15803d)', fontWeight: 700 }}>
            ✍️ On-Site Customer Sign-off &amp; Completion Acceptance
          </h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--ink-green-1, #15803d)', fontStyle: 'italic' }}>
            &quot;{template.customerSignatureDisclaimer}&quot;
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-green-1, #15803d)' }}>
              Homeowner / Client Printed Name:
              <input
                type="text"
                className="input"
                placeholder="e.g. Jane Smith"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>

            <div className={styles.sigPadWrapper}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-green-1, #15803d)' }}>Customer Digital Signature:</span>
              <SignaturePad onChange={setCustomerSignPath} label="Customer Signature" />
            </div>
          </div>
        </div>
      )}

      {/* Error & Success notifications */}
      {errorMessage && (
        <div style={{ background: 'rgba(248, 113, 113, 0.15)', color: 'var(--ink-red-1, #b91c1c)', border: '1px solid rgba(248, 113, 113, 0.25)', padding: '0.75rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div style={{ background: 'rgba(74, 222, 128, 0.15)', color: 'var(--ink-green-1, #15803d)', border: '1px solid rgba(74, 222, 128, 0.25)', padding: '0.75rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
          {successMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          className="btn secondary"
          style={{ flex: 1, padding: '0.65rem' }}
          disabled={pending}
          onClick={() => handleSubmit(false)}
        >
          {pending ? 'Saving...' : '💾 Save Field Draft'}
        </button>

        <button
          type="button"
          className="btn primary"
          style={{ flex: 2, padding: '0.65rem', fontWeight: 700 }}
          disabled={pending}
          onClick={() => handleSubmit(true)}
        >
          {pending ? 'Submitting...' : '✓ Complete & Sign Report'}
        </button>
      </div>
    </div>
  );
}
