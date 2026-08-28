'use client';

import { useState } from 'react';
import styles from '../manual.module.css';

export function ManualArticleActions() {
  const [copyStatus, setCopyStatus] = useState('');

  async function copyGuideLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus('Link copied');
    } catch {
      setCopyStatus('Copy unavailable');
    }
  }

  return (
    <div className={styles.articleActions}>
      <button type="button" onClick={copyGuideLink}>
        <span aria-hidden="true">↗</span> {copyStatus || 'Copy link'}
      </button>
      <button type="button" onClick={() => window.print()}>
        <span aria-hidden="true">▤</span> Print guide
      </button>
      <span className={styles.srOnly} role="status" aria-live="polite">{copyStatus}</span>
    </div>
  );
}
