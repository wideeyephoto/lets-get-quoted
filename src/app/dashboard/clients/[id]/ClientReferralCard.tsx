'use client';

import React, { useState } from 'react';
import { QRCodeSvg } from '@/components/ui/QRCodeSvg';

export default function ClientReferralCard({
  clientName,
  clientPhone,
  referralUrl,
  shareText,
  reward,
  referralCount = 0,
}: {
  clientName: string;
  clientPhone?: string | null;
  referralUrl: string;
  shareText: string;
  reward?: string | null;
  referralCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="panel workspace-section-card" style={{ marginBottom: '1rem' }}>
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Word of mouth</p>
        <h2>Referral link</h2>
      </div>
      <p className="workspace-details-copy" style={{ fontSize: '0.85rem' }}>
        Personal booking link for {clientName}. When a friend or neighbor books with it, attribution is tracked automatically.
      </p>

      <div style={{ margin: '0.75rem 0', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          readOnly
          value={referralUrl}
          style={{
            flex: 1,
            minWidth: '220px',
            fontSize: '0.8rem',
            padding: '0.45rem 0.65rem',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            border: '1px solid var(--rule-t20, rgba(255,255,255,0.15))',
            color: 'var(--ink-t100, #f8fafc)',
          }}
          aria-label={`Personal referral link for ${clientName}`}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="btn primary"
          style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          aria-label="Copy personal referral link"
        >
          {copied ? 'Copied! ✓' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((prev) => !prev)}
          className="btn secondary"
          style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          aria-label="Toggle QR code display"
        >
          {showQr ? 'Hide QR' : 'Show QR'}
        </button>
        {clientPhone ? (
          <a
            href={`sms:${clientPhone}?body=${encodeURIComponent(shareText)}`}
            className="btn secondary"
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
            aria-label={`Text referral link to ${clientName}`}
          >
            💬 Text link
          </a>
        ) : null}
      </div>

      {showQr ? (
        <div style={{ textAlign: 'center', background: '#ffffff', padding: '1rem', borderRadius: '8px', margin: '0.75rem 0' }}>
          <QRCodeSvg value={referralUrl} size={180} />
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#0f172a', fontWeight: 600 }}>
            Scan to book with {clientName}&apos;s referral reward
          </p>
        </div>
      ) : null}

      <div style={{ fontSize: '0.8rem', color: 'var(--mute-t58, #94a3b8)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Reward: <strong>{reward || '$50 off next service'}</strong></span>
        {referralCount > 0 ? (
          <span style={{ color: '#22c55e', fontWeight: 600 }}>
            ✓ {referralCount} referral{referralCount === 1 ? '' : 's'} sent
          </span>
        ) : (
          <span>No referrals sent yet</span>
        )}
      </div>
    </div>
  );
}
