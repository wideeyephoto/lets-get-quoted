'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '@/components/action-icon';
import type { TemplateCard } from '@/lib/campaign-recommendations';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import styles from './EmailTemplatePickerModal.module.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templates: TemplateCard[];
  onSelect: (draft: CampaignDraft) => void;
};

export default function CampaignStarterPickerModal({
  isOpen,
  onClose,
  templates,
  onSelect,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose Campaign Starter Template"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="document"
        style={{ maxWidth: '820px' }}
      >
        <div className={styles.topAccentRim} />

        <div className={styles.header}>
          <div>
            <div className={styles.headerBadge}>Campaign Starters</div>
            <h2 className={styles.title}>Choose Campaign Message Template</h2>
            <p className={styles.subtitle}>
              Select a pre-written, high-converting campaign starter tailored to your client history.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close campaign starter selector"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {templates.map((card) => {
              const disabled = card.disabledReason !== null;
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`template-card${disabled ? ' is-disabled' : ''}`}
                  disabled={disabled}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--edge-t14, rgba(255, 255, 255, 0.1))',
                    background: 'rgba(255, 255, 255, 0.03)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    if (card.draft) {
                      onSelect(card.draft);
                      onClose();
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <ActionIcon name={card.icon} />
                    <strong style={{ fontSize: '0.88rem', color: 'var(--foreground, #ffffff)' }}>{card.title}</strong>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)', marginBottom: '0.35rem' }}>
                    {card.audienceLabel} · {card.channelLabel}
                    {card.recipientCount !== null ? ` · ${card.recipientCount} clients` : ''}
                  </span>
                  {card.oneLiner ? (
                    <span style={{ fontSize: '0.73rem', color: 'var(--mute-t50, #64748b)', lineHeight: 1.35 }}>
                      {card.oneLiner}
                    </span>
                  ) : null}
                  {disabled ? (
                    <span style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.35rem' }}>
                      {card.disabledReason}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <p className={styles.footerNote}>
            Picking a template populates the message composer with tailored subject lines and copy.
          </p>
          <div className={styles.footerActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
