'use client';

import { useState } from 'react';
import {
  type LienWaiverType,
  LIEN_WAIVER_TITLES,
} from '@/lib/lien-waiver';
import {
  type SubcontractorWaiverRecord,
  auditJobSubcontractorCompliance,
  describeSubcontractorWaiverStatus,
} from '@/lib/subcontractor-waivers';
import { formatUsdExact } from '@/lib/money-format';

type Props = {
  jobId: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  jobStatus: string;
  suggestedAmount?: number;
  initialSubcontractors?: SubcontractorWaiverRecord[];
};

export default function LienWaiverPanel({
  jobId,
  jobRef: _jobRef,
  clientName,
  address,
  jobStatus,
  suggestedAmount = 0,
  initialSubcontractors,
}: Props) {
  const [waiverType, setWaiverType] = useState<LienWaiverType>(
    jobStatus === 'complete' ? 'unconditional_final' : 'conditional_progress',
  );
  const [amount, setAmount] = useState<number>(suggestedAmount);
  const [throughDate, setThroughDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [subs, setSubs] = useState<SubcontractorWaiverRecord[]>(
    initialSubcontractors ?? [],
  );

  const compliance = auditJobSubcontractorCompliance(subs, jobStatus === 'complete');

  function toggleSubStatus(id: string) {
    setSubs((prev) =>
      prev.map((sub) => {
        if (sub.id !== id) return sub;
        const nextStatus =
          sub.status === 'verified'
            ? 'requested'
            : sub.status === 'received'
              ? 'verified'
              : 'received';
        return { ...sub, status: nextStatus };
      }),
    );
  }

  function downloadUrl(): string {
    const params = new URLSearchParams({
      type: waiverType,
      amount: String(amount || 0),
      throughDate,
    });
    return `/api/jobs/${jobId}/lien-waiver?${params.toString()}`;
  }

  return (
    <div style={{
      background: 'var(--surface-primary, #ffffff)',
      border: '1px solid var(--border-default, #e2e8f0)',
      borderRadius: '12px',
      padding: '24px',
      marginTop: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-subtle, #f1f5f9)', paddingBottom: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
            📜 Milestone Billing & Lien Waivers
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
            Generate statutory construction lien waivers for draws, progress billings, and job closeout.
          </p>
        </div>
        <a
          href={downloadUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#047857',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.85rem',
            padding: '10px 18px',
            borderRadius: '8px',
            textDecoration: 'none',
            boxShadow: '0 1px 2px rgba(4, 120, 87, 0.2)',
          }}
        >
          <span>Download Official PDF</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>

      {/* Form Controls Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div>
          <label htmlFor="waiver-type-select" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
            Waiver Release Type
          </label>
          <select
            id="waiver-type-select"
            aria-label="Waiver Release Type"
            value={waiverType}
            onChange={(e) => setWaiverType(e.target.value as LienWaiverType)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#fff',
            }}
          >
            <option value="conditional_progress">🟡 Conditional Progress (Draw Invoiced)</option>
            <option value="unconditional_progress">🟢 Unconditional Progress (Draw Paid)</option>
            <option value="conditional_final">🟠 Conditional Final (Final Draw Invoiced)</option>
            <option value="unconditional_final">🟢 Unconditional Final (100% Paid in Full)</option>
          </select>
        </div>

        <div>
          <label htmlFor="waiver-amount-input" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
            Payment Amount ($)
          </label>
          <input
            id="waiver-amount-input"
            aria-label="Payment Amount ($)"
            type="number"
            min="0"
            step="0.01"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="0.00"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
            }}
          />
        </div>

        <div>
          <label htmlFor="waiver-date-input" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
            Through-Date
          </label>
          <input
            id="waiver-date-input"
            aria-label="Through-Date"
            type="date"
            value={throughDate}
            onChange={(e) => setThroughDate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
            }}
          />
        </div>
      </div>

      {/* Preview Card */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
            {LIEN_WAIVER_TITLES[waiverType]}
          </strong>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: waiverType.startsWith('conditional') ? '#fef3c7' : '#d1fae5',
            color: waiverType.startsWith('conditional') ? '#b45309' : '#047857',
          }}>
            {waiverType.startsWith('conditional') ? 'Conditional Release' : 'Unconditional Release'}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
          Covers <strong>{clientName}</strong> at <strong>{address || 'Project Location'}</strong> for{' '}
          <strong>{formatUsdExact(amount)}</strong> through <strong>{throughDate}</strong>.
        </p>
      </div>

      {/* Subcontractor Lien Waiver Compliance Checklist */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
            🤝 Subcontractor Lien Waiver Compliance
          </h3>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '12px',
            background: compliance.isFullyCompliant ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            color: compliance.isFullyCompliant ? '#047857' : '#b45309',
          }}>
            {compliance.summaryMessage}
          </span>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 14px' }}>Subcontractor</th>
                <th style={{ padding: '10px 14px' }}>Trade</th>
                <th style={{ padding: '10px 14px' }}>Contract Sum</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '16px 14px', color: '#64748b', textAlign: 'center' }}>
                    No subcontractor lien waivers on file for this job.
                  </td>
                </tr>
              ) : (
                subs.map((sub) => {
                  const desc = describeSubcontractorWaiverStatus(sub.status);
                  return (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>
                        {sub.subcontractorName}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b' }}>{sub.trade}</td>
                      <td style={{ padding: '10px 14px', color: '#0f172a' }}>
                        {formatUsdExact(sub.contractAmount)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: desc.tone === 'success' ? '#dcfce7' : desc.tone === 'warn' ? '#fef3c7' : '#f1f5f9',
                          color: desc.tone === 'success' ? '#15803d' : desc.tone === 'warn' ? '#b45309' : '#64748b',
                        }}>
                          {desc.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => toggleSubStatus(sub.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            color: '#334155',
                          }}
                        >
                          Cycle Status
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
