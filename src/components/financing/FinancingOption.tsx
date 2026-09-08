import React from 'react';
import type { FinancingAvailability } from '@/lib/bnpl-financing';

export default function FinancingOption({
  availability,
  businessName,
  className = '',
}: {
  availability: FinancingAvailability;
  businessName?: string;
  className?: string;
}) {
  if (!availability.available) return null;

  const contractorLabel = businessName?.trim() || 'your contractor';

  return (
    <div
      className={`financing-option-card ${className}`.trim()}
      style={{
        marginTop: '1rem',
        padding: '1rem 1.15rem',
        borderRadius: '10px',
        border: '1px solid var(--line, #e2e8f0)',
        background: 'rgba(var(--tint, 15, 23, 42), 0.02)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 240px' }}>
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: '0.92rem',
              color: 'var(--text, #0f172a)',
            }}
          >
            Monthly payment options
          </p>
          <p
            style={{
              margin: '0.35rem 0 0',
              fontSize: '0.82rem',
              color: 'var(--muted, #64748b)',
              lineHeight: 1.45,
            }}
          >
            See if you prequalify through Acorn Finance without affecting your credit score. Checking takes about a minute.
          </p>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <a
            href={availability.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn secondary"
            style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          >
            See options &rarr;
          </a>
        </div>
      </div>
      <p
        style={{
          margin: '0.75rem 0 0',
          paddingTop: '0.65rem',
          borderTop: '1px solid var(--line, #e2e8f0)',
          fontSize: '0.72rem',
          color: 'var(--muted, #64748b)',
          lineHeight: 1.4,
        }}
      >
        Acorn Finance is an independent lending marketplace &mdash; not {contractorLabel}, and not Let&rsquo;s Get Quoted.
        Prequalification is a soft credit check and does not guarantee loan approval or terms.
        Loan approval does not pay this invoice or approve this quote; approved funds are disbursed directly to you to pay {contractorLabel}.
      </p>
    </div>
  );
}
