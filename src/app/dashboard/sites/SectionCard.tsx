'use client';

import type { ReactNode } from 'react';
import styles from './SiteEditor.module.css';

type SectionCardProps = {
  title: string;
  description?: string;
  // A short, evidence-backed "why this converts" tip shown when the card is
  // open — nudges owners to fill in the high-impact sections. Sourced from the
  // home-services CRO audit.
  evidence?: string;
  // When these are provided, the header shows an enable checkbox + On/Off pill.
  // Omit them for sections that are always active (e.g. the quote form).
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  // Content-status hint beside the On/Off pill — e.g. "4 services", or a warn
  // tone when the section is enabled but empty (it renders nothing publicly
  // until it has content, which otherwise reads as "On but not showing").
  hint?: string;
  hintTone?: 'ok' | 'warn';
  open: boolean;
  onToggleOpen: () => void;
  // 'featured' = the flagship treatment (animated accent border, glow);
  // 'linked' = quiet accent border marking membership in a featured group.
  variant?: 'featured' | 'linked';
  children?: ReactNode;
};

// Collapsible builder section. Header (always visible) shows the title, an
// optional enable toggle + On/Off state, and a chevron; the configuration
// collapses so the Design tab stays a short, scannable list instead of one long
// scroll.
export default function SectionCard({ title, description, evidence, enabled, onToggleEnabled, hint, hintTone, open, onToggleOpen, variant, children }: SectionCardProps) {
  const hasSwitch = typeof enabled === 'boolean' && Boolean(onToggleEnabled);
  const variantClass = variant === 'featured' ? ` ${styles.sectionCardFeatured}` : variant === 'linked' ? ` ${styles.sectionCardLinked}` : '';

  return (
    <div className={`${styles.sectionCard}${open ? ` ${styles.sectionCardOpen}` : ''}${variantClass}`}>
      <div className={styles.sectionCardHead}>
        {hasSwitch && (
          <label className={styles.sectionCardSwitch}>
            <input type="checkbox" checked={enabled} onChange={(event) => onToggleEnabled!(event.target.checked)} />
            <span className={styles.srOnly}>{enabled ? 'Disable' : 'Enable'} {title}</span>
          </label>
        )}
        <button type="button" className={styles.sectionCardTrigger} onClick={onToggleOpen} aria-expanded={open}>
          <span className={styles.sectionCardTitle}>
            {title}
            {hasSwitch && (
              <span className={`${styles.sectionCardState}${enabled ? ` ${styles.sectionCardStateOn}` : ''}`}>{enabled ? 'On' : 'Off'}</span>
            )}
            {hint && (
              <span className={`${styles.sectionCardHint}${hintTone === 'warn' ? ` ${styles.sectionCardHintWarn}` : ''}`}>{hint}</span>
            )}
          </span>
          <span className={styles.sectionCardChevron} aria-hidden="true">▾</span>
        </button>
      </div>
      {open && (
        <div className={styles.sectionCardBody}>
          {description && <p className={styles.sectionCardDesc}>{description}</p>}
          {evidence && (
            <p className={styles.sectionCardEvidence}>
              <strong>Why this converts</strong>
              {evidence}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
