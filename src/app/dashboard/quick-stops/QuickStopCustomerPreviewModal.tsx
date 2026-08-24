'use client';

import { useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  minFeeDollars: number;
  maxFeeDollars: number;
  earliestTime: string;
  latestEnd: string;
  categories: string[];
};

export default function QuickStopCustomerPreviewModal({
  isOpen,
  onClose,
  businessName,
  minFeeDollars,
  maxFeeDollars,
  earliestTime,
  latestEnd,
  categories,
}: Props) {
  const [tab, setTab] = useState<'sms' | 'checkout' | 'confirmation'>('sms');

  if (!isOpen) return null;

  const typicalFee = Math.round((minFeeDollars + maxFeeDollars) / 2) || 95;
  const sampleCategory = categories[0] || 'Kitchen faucet leak';
  const formatTime = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m || 0).padStart(2, '0')} ${period}`;
  };
  const arrivalWindow = earliestTime && latestEnd
    ? `${formatTime(earliestTime)} – ${formatTime(latestEnd)}`
    : '3:15 PM – 4:45 PM';

  return (
    <div className="qs-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="qs-preview-title" onClick={onClose}>
      <div className="qs-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="qs-modal-header">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Customer Experience</p>
            <h2 id="qs-preview-title" style={{ fontSize: '1.25rem', margin: '0.2rem 0 0' }}>What Your Customer Sees</h2>
          </div>
          <button type="button" className="qs-modal-close" onClick={onClose} aria-label="Close preview">
            ✕
          </button>
        </div>

        <div className="qs-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sms'}
            className={`qs-modal-tab ${tab === 'sms' ? 'active' : ''}`}
            onClick={() => setTab('sms')}
          >
            1. SMS / Message Offer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'checkout'}
            className={`qs-modal-tab ${tab === 'checkout' ? 'active' : ''}`}
            onClick={() => setTab('checkout')}
          >
            2. Payment Screen
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'confirmation'}
            className={`qs-modal-tab ${tab === 'confirmation' ? 'active' : ''}`}
            onClick={() => setTab('confirmation')}
          >
            3. Reserved Confirmation
          </button>
        </div>

        <div className="qs-modal-body">
          {tab === 'sms' && (
            <div className="qs-phone-frame">
              <div className="qs-phone-topbar">
                <span className="qs-phone-time">9:41 AM</span>
                <span className="qs-phone-carrier">Messages</span>
              </div>
              <div className="qs-phone-chat">
                <div className="qs-chat-sender">
                  <div className="qs-chat-avatar">{businessName.slice(0, 1).toUpperCase()}</div>
                  <strong>{businessName}</strong>
                </div>

                <div className="qs-bubble incoming">
                  <p>
                    Hi Sarah, we&apos;re currently on route nearby for a job and can fit in your <strong>{sampleCategory}</strong> today between <strong>{arrivalWindow}</strong>.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Tap below to lock in this priority arrival window with a <strong>${typicalFee}</strong> priority visit fee:
                  </p>
                  <div className="qs-bubble-link">
                    <span>app.letsgetquoted.com/pay/qs_demo...</span>
                    <small>Expires in 15 minutes if not reserved</small>
                  </div>
                </div>

                <div className="qs-phone-choice-row">
                  <div className="qs-choice-pill primary">
                    <span>Pay ${typicalFee} Priority Fee</span>
                    <small>Secures arrival window immediately</small>
                  </div>
                  <div className="qs-choice-pill secondary">
                    <span>Keep Normal Schedule</span>
                    <small>Standard booking without priority fee</small>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'checkout' && (
            <div className="qs-phone-frame">
              <div className="qs-pay-page-preview">
                <div className="qs-pay-header">
                  <span className="qs-pay-badge">⚡ Priority Visit Lock</span>
                  <div className="qs-pay-timer">⏱ Holds window for 14:22</div>
                </div>

                <div className="qs-pay-card">
                  <div className="qs-pay-row">
                    <span>Contractor</span>
                    <strong>{businessName}</strong>
                  </div>
                  <div className="qs-pay-row">
                    <span>Proposed Window</span>
                    <strong>Today · {arrivalWindow}</strong>
                  </div>
                  <div className="qs-pay-row">
                    <span>Reason</span>
                    <span>{sampleCategory}</span>
                  </div>
                  <div className="qs-pay-divider" />
                  <div className="qs-pay-row total">
                    <span>Priority Visit Fee</span>
                    <strong>${typicalFee}.00</strong>
                  </div>
                </div>

                <div className="qs-pay-disclaimer">
                  🛡 <strong>What this fee covers:</strong> Guarantees today&apos;s arrival window on the contractor&apos;s route. Service and repair work is quoted &amp; invoiced separately on-site.
                </div>

                <div className="qs-pay-button">
                  <span>Pay ${typicalFee}.00 with Apple Pay / Card</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'confirmation' && (
            <div className="qs-phone-frame">
              <div className="qs-pay-page-preview">
                <div className="qs-receipt-hero">
                  <div className="qs-receipt-icon">✓</div>
                  <h3>Priority Stop Confirmed!</h3>
                  <p>You&apos;re on today&apos;s schedule with {businessName}.</p>
                </div>

                <div className="qs-pay-card">
                  <div className="qs-pay-row">
                    <span>Arrival Window</span>
                    <strong>Today, {arrivalWindow}</strong>
                  </div>
                  <div className="qs-pay-row">
                    <span>Status</span>
                    <span className="qs-status-pill green">Technician Dispatched</span>
                  </div>
                  <div className="qs-pay-row">
                    <span>Deposit Paid</span>
                    <strong>${typicalFee}.00</strong>
                  </div>
                </div>

                <div className="qs-receipt-terms">
                  <p><strong>Cancellation Policy:</strong> Free full refund within 15 minutes of booking if your plans change.</p>
                  <p style={{ marginTop: '0.4rem' }}>You will receive SMS tracking updates when the technician is en route.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="qs-modal-footer">
          <p className="qs-modal-footer-note">
            💡 The homeowner is charged <strong>${typicalFee}</strong> for the priority visit. You receive the funds directly via Stripe minus the 10% platform fee.
          </p>
          <button type="button" className="btn primary" onClick={onClose}>
            Done Previewing
          </button>
        </div>
      </div>
    </div>
  );
}
