'use client';

import React, { useState } from 'react';
import { ExternalLink, CheckSquare, Square, ArrowRight, X } from 'lucide-react';
import type { CardDesignDocument } from '@/lib/merchandise/card-renderer';
import { renderCardArtwork } from '@/lib/merchandise/card-renderer';
import {
  type SupportedCardQuantity,
  CARD_RETAIL_SUBTOTAL_CENTS,
  centsToDollars,
} from '@/lib/merchandise/card-catalog-types';
import styles from './card-purchase.module.css';

interface CardProofReviewProps {
  document: CardDesignDocument;
  quantity: SupportedCardQuantity;
  onApproved: () => void;
  onEditRequested: () => void;
  onCancel: () => void;
}

export default function CardProofReview({
  document,
  quantity,
  onApproved,
  onEditRequested,
  onCancel,
}: CardProofReviewProps) {
  const [isChecked, setIsChecked] = useState(false);
  const { frontSvg, backSvg } = renderCardArtwork(document);
  const totalAmount = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[quantity]);

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={`${styles.modalWindow} ${styles.modalWindowWide}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Review &amp; Approve Digital Proof</h3>
            <p className={styles.modalSubtitle}>
              Please inspect both sides carefully. Your cards will be printed exactly as shown below.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={styles.modalCloseBtn}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Side-by-side Proofs */}
        <div className={styles.proofStageGrid}>
          <div className={styles.proofArtworkWrapper}>
            <span className={styles.proofArtworkLabel}>Front Production File</span>
            <div
              className={styles.proofCardContainer}
              dangerouslySetInnerHTML={{ __html: frontSvg }}
            />
          </div>

          <div className={styles.proofArtworkWrapper}>
            <span className={styles.proofArtworkLabel}>Back Production File</span>
            <div
              className={styles.proofCardContainer}
              dangerouslySetInnerHTML={{ __html: backSvg }}
            />
          </div>
        </div>

        {/* Text Details & QR Link Verification */}
        <div className={styles.proofDetailsGrid}>
          <div>
            <span className={styles.proofDetailHeading}>
              Printed Contact Details
            </span>
            <p className={styles.proofDetailText} style={{ fontWeight: 800 }}>{document.content.businessName}</p>
            <p className={styles.proofDetailText}>📞 {document.content.phone}</p>
            {document.content.email && <p className={styles.proofDetailText}>✉️ {document.content.email}</p>}
            {document.content.website && <p className={styles.proofDetailText}>🌐 {document.content.website}</p>}
            {document.content.license && (
              <p className={styles.proofDetailText} style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                REG: {document.content.license}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span className={styles.proofDetailHeading}>
                Dynamic QR Destination
              </span>
              <p className={styles.proofQrUrlBox}>
                {document.qr.destinationUrl}
              </p>
            </div>

            <div>
              <a
                href={document.qr.destinationUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.proofTestQrLink}
              >
                <span>Test QR destination link in new tab</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Mandatory Proof Approval Checkbox */}
        <div
          className={styles.proofCheckboxCard}
          onClick={() => setIsChecked(!isChecked)}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => setIsChecked(e.target.checked)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          />
          <div style={{ paddingTop: '0.1rem', flexShrink: 0 }}>
            {isChecked ? (
              <CheckSquare size={18} style={{ color: 'var(--accent)' }} />
            ) : (
              <Square size={18} style={{ color: 'var(--muted)' }} />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={styles.proofCheckboxTitle}>
              I have checked both sides and verify that my business details, phone number, and spelling are correct.
            </span>
            <span className={styles.proofCheckboxDesc}>
              Print runs are manufactured automatically per these exact proof files.
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div className={styles.modalFooter}>
          <button
            type="button"
            onClick={onEditRequested}
            className={styles.modalSecondaryBtn}
          >
            ← Back to Edit Details
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onCancel}
              className={styles.modalSecondaryBtn}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!isChecked}
              onClick={onApproved}
              className={styles.modalPrimaryBtn}
            >
              <span>Continue to Payment (${totalAmount.toFixed(2)})</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

