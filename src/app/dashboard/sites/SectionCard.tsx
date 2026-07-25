'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from './SiteEditor.module.css';

// Everything a card needs to be a drag-to-reorder row on the Page tab. When
// present, the card renders a grip handle in its header and sinks into its page
// position via CSS `order`. The GRIP (built by the parent) is the drag source —
// the card itself is never draggable, so its inputs stay fully usable — and the
// card is the drop target. Absent = an ordinary fixed card.
export type SectionReorder = {
  grip: ReactNode;
  orderIndex: number;
  active: boolean; // this card is the one currently being dragged
  onDrop: () => void;
  onDragEnd: () => void;
};

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
  // When set, the card is a drag-to-reorder row (see SectionReorder).
  reorder?: SectionReorder;
  children?: ReactNode;
};

// Collapsible builder section. Header (always visible) shows the title, an
// optional enable toggle + On/Off state, and a chevron; the configuration
// collapses so the Design tab stays a short, scannable list instead of one long
// scroll.
export default function SectionCard({ title, description, evidence, enabled, onToggleEnabled, hint, hintTone, open, onToggleOpen, variant, reorder, children }: SectionCardProps) {
  const hasSwitch = typeof enabled === 'boolean' && Boolean(onToggleEnabled);
  const variantClass = variant === 'featured' ? ` ${styles.sectionCardFeatured}` : variant === 'linked' ? ` ${styles.sectionCardLinked}` : '';
  const reorderClass = reorder ? ` ${styles.sectionCardReorder}${reorder.active ? ` ${styles.sectionCardDragging}` : ''}` : '';
  const rootStyle: CSSProperties | undefined = reorder ? { order: reorder.orderIndex } : undefined;

  return (
    <div
      className={`${styles.sectionCard}${open ? ` ${styles.sectionCardOpen}` : ''}${variantClass}${reorderClass}`}
      style={rootStyle}
      onDragOver={reorder ? (event) => event.preventDefault() : undefined}
      onDrop={reorder ? (event) => { event.preventDefault(); reorder.onDrop(); } : undefined}
      onDragEnd={reorder ? reorder.onDragEnd : undefined}
    >
      <div className={styles.sectionCardHead}>
        {reorder && <div className={styles.sectionCardGrip}>{reorder.grip}</div>}
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
