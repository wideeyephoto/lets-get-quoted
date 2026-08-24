'use client';

import React from 'react';
import styles from './ai.module.css';

export type AiStreamingCardProps = {
  title?: string;
  streaming?: boolean;
  content?: string;
  placeholder?: string;
  className?: string;
};

export function AiStreamingCard({
  title,
  streaming = false,
  content,
  placeholder = 'AI is crafting your content...',
  className = '',
}: AiStreamingCardProps) {
  return (
    <div className={`${styles.diffCard} ${streaming ? styles.shimmerCard : ''} ${className}`}>
      {title && (
        <div className={styles.diffHeader}>
          <div className={styles.diffTitle}>
            <span className={styles.sparkleIcon} aria-hidden="true">✦</span>
            <span>{title}</span>
            <span className={styles.aiBadge}>{streaming ? 'Generating' : 'AI Ready'}</span>
          </div>
        </div>
      )}
      <div style={{ color: content ? 'var(--text)' : 'var(--muted)', fontStyle: content ? 'normal' : 'italic', fontSize: '0.9rem', lineHeight: 1.5 }}>
        {content || placeholder}
      </div>
    </div>
  );
}
