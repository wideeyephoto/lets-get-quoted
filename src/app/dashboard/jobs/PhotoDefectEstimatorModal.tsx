'use client';

import React, { useState, useEffect } from 'react';
import {
  analyzePhotoDefectsAction,
  type AnalyzePhotoDefectsResponse,
} from './photo-estimate-actions';
import type { PhotoDefectEstimateResult, DefectItem } from '@/lib/multimodal-defect-estimator';

export interface PhotoDefectEstimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTrade?: string;
  defaultNotes?: string;
  onApplyLineItems?: (items: Array<{ name: string; cost: number }>) => void;
}

const COMMON_TRADES = [
  'Roofing',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Siding & Gutters',
  'Painting',
  'Carpentry',
  'General Repair',
];

export default function PhotoDefectEstimatorModal({
  isOpen,
  onClose,
  defaultTrade = 'Roofing',
  defaultNotes = '',
  onApplyLineItems,
}: PhotoDefectEstimatorModalProps) {
  const [trade, setTrade] = useState(defaultTrade);
  const [notes, setNotes] = useState(defaultNotes);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<PhotoDefectEstimateResult | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTrade(defaultTrade);
      setNotes(defaultNotes);
      setApplied(false);
      setError(null);
    }
  }, [isOpen, defaultTrade, defaultNotes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPhotoPreview(result);
        setPhotoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res: AnalyzePhotoDefectsResponse = await analyzePhotoDefectsAction({
        trade,
        notes: notes || undefined,
        photoUrl: photoUrl || undefined,
      });

      if (res.ok && res.estimate) {
        setEstimate(res.estimate);
      } else {
        setError(res.message || 'Inspection failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected analysis failure');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyToQuote = () => {
    if (!estimate || !onApplyLineItems) return;
    const items = estimate.suggestedQuoteDraft.lineItems.length > 0
      ? estimate.suggestedQuoteDraft.lineItems
      : estimate.defects.map((d) => ({
          name: d.defectName,
          cost: d.estimatedTotalDollars,
        }));

    onApplyLineItems(items);
    setApplied(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const getSeverityStyle = (severity: DefectItem['severity']) => {
    switch (severity) {
      case 'structural':
        return { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid #ef4444' };
      case 'severe':
        return { background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid #f97316' };
      case 'moderate':
        return { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid #f59e0b' };
      case 'minor':
      default:
        return { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid #3b82f6' };
    }
  };

  const getUrgencyBadge = (urgency: PhotoDefectEstimateResult['urgency']) => {
    switch (urgency) {
      case 'emergency':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#ef4444', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>EMERGENCY</span>;
      case 'urgent':
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f59e0b', color: '#18181b', fontSize: '0.75rem', fontWeight: 700 }}>URGENT</span>;
      case 'routine':
      default:
        return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--rule-t12, rgba(255,255,255,0.1))', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem', fontWeight: 600 }}>ROUTINE</span>;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-defect-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        padding: '1rem',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-card, #18181b)',
          border: '1px solid var(--rule-t12, rgba(255, 255, 255, 0.12))',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--rule-t12, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📸</span>
              <h2
                id="photo-defect-modal-title"
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #f4f4f5)',
                }}
              >
                AI Multimodal Photo Defect Estimator
              </h2>
            </div>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.8125rem',
                color: 'var(--text-muted, #71717a)',
              }}
            >
              Analyze damage photos with Gemini Vision to detect defects, labor hours, and quote line items.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #a1a1aa)',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: '6px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Trade Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #d4d4d8)' }}>
              Trade / Specialty
            </label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {COMMON_TRADES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTrade(t)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: trade === t ? 'var(--accent, #3b82f6)' : 'var(--rule-t12, rgba(255,255,255,0.1))',
                    background: trade === t ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: trade === t ? '#fff' : 'var(--text-secondary, #a1a1aa)',
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              placeholder="e.g. Roofing, Drywall repair, Masonry..."
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid var(--rule-t12, rgba(255,255,255,0.15))',
                background: 'var(--bg-input, rgba(0,0,0,0.25))',
                color: 'var(--text-primary, #fff)',
              }}
            />
          </div>

          {/* Photo Selection / Upload */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #d4d4d8)' }}>
              Damage / Inspection Photo
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.5rem',
                    fontSize: '0.8125rem',
                    borderRadius: '6px',
                    border: '1px dashed var(--rule-t12, rgba(255,255,255,0.2))',
                    background: 'var(--bg-input, rgba(0,0,0,0.2))',
                    color: 'var(--text-secondary, #a1a1aa)',
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="text"
                  value={photoUrl.startsWith('data:') ? '' : photoUrl}
                  onChange={(e) => {
                    setPhotoUrl(e.target.value);
                    setPhotoPreview(e.target.value || null);
                  }}
                  placeholder="...or paste photo image URL"
                  style={{
                    width: '100%',
                    marginTop: '0.4rem',
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.8125rem',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-t12, rgba(255,255,255,0.15))',
                    background: 'var(--bg-input, rgba(0,0,0,0.25))',
                    color: 'var(--text-primary, #fff)',
                  }}
                />
              </div>
              {photoPreview ? (
                <div
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid var(--rule-t12, rgba(255,255,255,0.2))',
                    flexShrink: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Damage preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Inspection Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary, #d4d4d8)' }}>
              Site &amp; Damage Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Missing shingles on north slope, water intrusion visible around attic chimney flashing..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid var(--rule-t12, rgba(255,255,255,0.15))',
                background: 'var(--bg-input, rgba(0,0,0,0.25))',
                color: 'var(--text-primary, #fff)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Action Trigger */}
          <div>
            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={analyzing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.25rem',
                borderRadius: '6px',
                background: 'var(--accent, #3b82f6)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: analyzing ? 'wait' : 'pointer',
                opacity: analyzing ? 0.7 : 1,
              }}
            >
              {analyzing ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                  Analyzing Visual Defects...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Run AI Vision Inspection
                </>
              )}
            </button>
          </div>

          {error ? (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', fontSize: '0.875rem' }}>
              {error}
            </div>
          ) : null}

          {/* Results View */}
          {estimate ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', borderTop: '1px solid var(--rule-t12, rgba(255,255,255,0.1))', paddingTop: '1rem' }}>
              {/* Summary Card */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                  border: '1px solid var(--rule-t12, rgba(255,255,255,0.08))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary, #fff)' }}>
                      Inspection Findings
                    </strong>
                    {getUrgencyBadge(estimate.urgency)}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary, #d4d4d8)', lineHeight: 1.4 }}>
                    {estimate.overallDamageSummary}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #a1a1aa)' }}>Estimated Total</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent, #38bdf8)' }}>
                    ${estimate.totalEstimatedRepairDollars.toLocaleString('en-US')}
                  </div>
                </div>
              </div>

              {/* Defect Items */}
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary, #a1a1aa)' }}>
                  Detected Defect Items ({estimate.defects.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {estimate.defects.map((defect, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '6px',
                        background: 'var(--bg-card, rgba(255,255,255,0.02))',
                        border: '1px solid var(--rule-t12, rgba(255,255,255,0.06))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary, #f4f4f5)' }}>
                            {defect.defectName}
                          </span>
                          <span
                            style={{
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              ...getSeverityStyle(defect.severity),
                            }}
                          >
                            {defect.severity}
                          </span>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--accent, #38bdf8)' }}>
                          ${defect.estimatedTotalDollars.toLocaleString('en-US')}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {defect.recommendedRepair}
                      </p>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted, #71717a)' }}>
                        <span>⏱️ {defect.estimatedLaborHours} hrs labor</span>
                        <span>📦 ${defect.estimatedMaterialCostDollars} materials</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--rule-t12, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid var(--rule-t12, rgba(255,255,255,0.15))',
              background: 'transparent',
              color: 'var(--text-secondary, #d4d4d8)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>

          {estimate && onApplyLineItems ? (
            <button
              type="button"
              onClick={handleApplyToQuote}
              disabled={applied}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                background: applied ? '#10b981' : 'var(--accent, #3b82f6)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: applied ? 'default' : 'pointer',
              }}
            >
              {applied ? '✓ Line Items Added to Quote!' : 'Insert Defect Line Items into Quote'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}