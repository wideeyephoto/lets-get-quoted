'use client';

import React from 'react';
import styles from './ai.module.css';

export type DiffItem = {
  id: string;
  type: 'addition' | 'deletion' | 'unchanged';
  label: string;
  amount?: number;
  note?: string;
  checked?: boolean;
};

export type AiDiffCardProps = {
  title: string;
  description?: string;
  items: readonly DiffItem[];
  onToggleItem?: (id: string, checked: boolean) => void;
  onApply?: () => void;
  onDiscard?: () => void;
  applyLabel?: string;
  discardLabel?: string;
  className?: string;
};

export function AiDiffCard({
  title,
  description,
  items,
  onToggleItem,
  onApply,
  onDiscard,
  applyLabel = 'Apply AI Changes',
  discardLabel = 'Discard',
  className = '',
}: AiDiffCardProps) {
  return (
    <div className={`${styles.diffCard} ${className}`} role="region" aria-label={title}>
      <div className={styles.diffHeader}>
        <div>
          <div className={styles.diffTitle}>
            <span className={styles.sparkleIcon} aria-hidden="true">✦</span>
            <span>{title}</span>
            <span className={styles.aiBadge}>AI Preview</span>
          </div>
          {description && <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem', margin: 0 }}>{description}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.75rem 0' }}>
        {items.map((item) => {
          const isAdd = item.type === 'addition';
          const isDel = item.type === 'deletion';
          const diffClass = isAdd ? styles.diffAddition : isDel ? styles.diffDeletion : '';

          return (
            <div key={item.id} className={`${styles.diffRow} ${diffClass}`}>
              {onToggleItem && (
                <input
                  type="checkbox"
                  checked={item.checked ?? true}
                  onChange={(e) => onToggleItem(item.id, e.target.checked)}
                  style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                  aria-label={`Include ${item.label}`}
                />
              )}
              <span className={styles.diffBadge}>{isAdd ? '+' : isDel ? '-' : '•'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{item.label}</span>
                {item.note && <span style={{ opacity: 0.8, fontSize: '0.8rem', marginLeft: '0.5rem' }}>({item.note})</span>}
              </div>
              {item.amount !== undefined && (
                <span style={{ fontWeight: 700 }}>
                  {isAdd ? '+' : isDel ? '-' : ''}${Math.abs(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {(onApply || onDiscard) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className={styles.voiceBtn}
              style={{ minHeight: '36px' }}
            >
              {discardLabel}
            </button>
          )}
          {onApply && (
            <button
              type="button"
              onClick={onApply}
              className={styles.sparkleBtn}
              style={{ minHeight: '36px' }}
            >
              {applyLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
