'use client';

import type { JobFormSubmission } from '@/lib/forms/types';

export default function PrintableCertificate({
  submission,
  businessName = 'Licensed Contractor Services',
  clientName = 'Client',
  address = 'Job Site',
  jobRef = '1001',
}: {
  submission: JobFormSubmission;
  businessName?: string;
  clientName?: string;
  address?: string;
  jobRef?: string;
}) {
  const template = submission.templateSnapshot;
  const isComplete = submission.status === 'completed';

  return (
    <div
      style={{
        maxWidth: '850px',
        margin: '0 auto',
        padding: '40px',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        lineHeight: 1.5,
      }}
    >
      {/* Printable Actions (Hidden when printing) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f1f5f9',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '30px',
        }}
      >
        <span style={{ fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>
          📄 Official Verification &amp; Inspection Certificate
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 18px',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* Certificate Frame */}
      <div
        style={{
          border: '3px double #0f172a',
          padding: '35px',
          borderRadius: '4px',
          position: 'relative',
        }}
      >
        {/* Certificate Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2px solid #0f172a',
            paddingBottom: '20px',
            marginBottom: '25px',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#0369a1',
              }}
            >
              {businessName}
            </span>
            <h1 style={{ margin: '4px 0 6px', fontSize: '1.6rem', fontWeight: 800 }}>
              {template.title}
            </h1>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
              {template.description}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-block',
                border: '2px solid #16a34a',
                color: '#166534',
                padding: '4px 12px',
                borderRadius: '4px',
                fontWeight: 800,
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {isComplete ? 'CERTIFIED & EXECUTED' : 'RECORD OF INSPECTION'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
              Cert Ref: #{submission.id.slice(0, 12).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Job Details Meta Table */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '25px',
            fontSize: '0.85rem',
          }}
        >
          <tbody>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px 0', fontWeight: 700, width: '20%', color: '#64748b' }}>Client:</td>
              <td style={{ padding: '8px 0', fontWeight: 600, width: '30%' }}>{clientName}</td>
              <td style={{ padding: '8px 0', fontWeight: 700, width: '20%', color: '#64748b' }}>Job Reference:</td>
              <td style={{ padding: '8px 0', fontWeight: 600, width: '30%' }}>#{jobRef}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '8px 0', fontWeight: 700, color: '#64748b' }}>Property Address:</td>
              <td style={{ padding: '8px 0', fontWeight: 600 }}>{address || 'On File'}</td>
              <td style={{ padding: '8px 0', fontWeight: 700, color: '#64748b' }}>Inspection Date:</td>
              <td style={{ padding: '8px 0', fontWeight: 600 }}>
                {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString() : new Date().toLocaleDateString()}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 0', fontWeight: 700, color: '#64748b' }}>Trade Category:</td>
              <td style={{ padding: '8px 0', fontWeight: 600 }}>{template.trade.toUpperCase()} · {template.category.replace('_', ' ').toUpperCase()}</td>
              <td style={{ padding: '8px 0', fontWeight: 700, color: '#64748b' }}>QA Score:</td>
              <td style={{ padding: '8px 0', fontWeight: 800, color: '#16a34a' }}>
                {submission.summary.compliancePct}% PASSED ({submission.summary.passedItems} of {submission.summary.totalItems} Checks)
              </td>
            </tr>
          </tbody>
        </table>

        {/* Inspection Sections & Field Values */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
          {template.sections.map((sec) => (
            <div key={sec.id}>
              <h3
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  borderBottom: '1px solid #cbd5e1',
                  paddingBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {sec.title}
              </h3>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.85rem',
                }}
              >
                <tbody>
                  {sec.fields.map((f, i) => {
                    const val = submission.values[f.id];
                    return (
                      <tr
                        key={f.id}
                        style={{
                          background: i % 2 === 0 ? '#f8fafc' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <td style={{ padding: '8px 12px', width: '65%', color: '#1e293b' }}>
                          {f.label}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            width: '35%',
                            fontWeight: 700,
                            textAlign: 'right',
                            color:
                              val === 'pass'
                                ? '#16a34a'
                                : val === 'fail'
                                ? '#dc2626'
                                : '#0f172a',
                          }}
                        >
                          {val === 'pass'
                            ? '✓ PASS'
                            : val === 'fail'
                            ? '✕ FAIL'
                            : val === 'na'
                            ? 'N/A'
                            : val
                            ? `${val} ${f.unit || ''}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Photos Grid if any */}
        {submission.photos && submission.photos.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <h3
              style={{
                margin: '0 0 10px 0',
                fontSize: '1rem',
                fontWeight: 800,
                color: '#0f172a',
                borderBottom: '1px solid #cbd5e1',
                paddingBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              Inspection &amp; Verification Photographic Evidence
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
              }}
            >
              {submission.photos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#000000',
                  }}
                >
                  <img
                    src={p.url || p.path}
                    alt="Inspection Evidence"
                    style={{ width: '100%', height: '140px', objectFit: 'cover' }}
                  />
                  <div style={{ padding: '4px 8px', background: '#f8fafc', fontSize: '0.7rem', color: '#64748b' }}>
                    {p.caption || 'Verified Site Photo'} · {new Date(p.timestamp).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dual Signatures Execution Block */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '30px',
            borderTop: '2px solid #0f172a',
            paddingTop: '20px',
            marginTop: '20px',
          }}
        >
          {/* Technician Signature */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Certified Technician Sign-off
            </span>
            <div
              style={{
                borderBottom: '1px solid #0f172a',
                height: '50px',
                display: 'flex',
                alignItems: 'flex-end',
                paddingBottom: '4px',
                fontStyle: 'italic',
                fontFamily: 'serif',
                fontSize: '1.2rem',
              }}
            >
              {submission.techSignature?.name || 'Authorized Field Inspector'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              <strong>Name:</strong> {submission.techSignature?.name || 'Field Lead'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              <strong>Date Certified:</strong> {submission.techSignature?.signedAt ? new Date(submission.techSignature.signedAt).toLocaleDateString() : 'On File'}
            </div>
          </div>

          {/* Customer Signature */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Customer Completion Acceptance
            </span>
            <div
              style={{
                borderBottom: '1px solid #0f172a',
                height: '50px',
                display: 'flex',
                alignItems: 'flex-end',
                paddingBottom: '4px',
                fontStyle: 'italic',
                fontFamily: 'serif',
                fontSize: '1.2rem',
              }}
            >
              {submission.customerSignature?.name || (template.requireCustomerSignature ? 'Awaiting Customer E-Signature' : 'N/A')}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              <strong>Customer:</strong> {submission.customerSignature?.name || clientName}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              <strong>Date Accepted:</strong> {submission.customerSignature?.signedAt ? new Date(submission.customerSignature.signedAt).toLocaleDateString() : 'Pending'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
