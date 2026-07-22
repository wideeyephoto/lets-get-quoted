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
  open: boolean;
  onToggleOpen: () => void;
  children?: ReactNode;
};

// Collapsible builder section. Header (always visible) shows the title, an
// optional enable toggle + On/Off state, and a chevron; the configuration
// collapses so the Design tab stays a short, scannable list instead of one long
// scroll.
export default function SectionCard({ title, description, evidence, enabled, onToggleEnabled, open, onToggleOpen, children }: SectionCardProps) {
  const hasSwitch = typeof enabled === 'boolean' && Boolean(onToggleEnabled);

  return (
    <div className={`${styles.sectionCard}${open ? ` ${styles.sectionCardOpen}` : ''}`}>
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
