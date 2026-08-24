'use client';

import React from 'react';
import styles from './ai.module.css';

export type AiSparkleButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  sparkleSize?: number;
};

export function AiSparkleButton({
  children,
  loading = false,
  loadingLabel = 'Generating...',
  sparkleSize = 16,
  className = '',
  disabled,
  ...props
}: AiSparkleButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.sparkleBtn} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      <span className={styles.sparkleIcon} aria-hidden="true">
        {loading ? (
          <svg width={sparkleSize} height={sparkleSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width={sparkleSize} height={sparkleSize} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
          </svg>
        )}
      </span>
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
