'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../blog.module.css';

interface BlogArticleClientProps {
  title: string;
  url: string;
}

export default function BlogArticleClient({ title, url }: BlogArticleClientProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showCompanion, setShowCompanion] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleScroll() {
      const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (totalHeight <= 0) return;
      const currentScroll = window.scrollY;
      const progress = Math.min(100, Math.max(0, (currentScroll / totalHeight) * 100));
      setScrollProgress(progress);
      setShowCompanion(currentScroll > 450);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function handleCopy() {
    try {
      const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Ignore clipboard write failure
    }
  }

  const effectiveUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(effectiveUrl)}`;
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(effectiveUrl)}`;

  return (
    <>
      {/* Dynamic Radiant Reading Progress Bar */}
      <div
        className={styles.progressBar}
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Reading progress"
      />

      {/* Floating Sticky Reading Companion Bar on Scroll */}
      {showCompanion && (
        <aside className={styles.readingCompanion} aria-label="Reading controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <Link
              href="/blog"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--muted)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              &larr; Guides
            </Link>
            <span className={styles.companionTitle} title={title}>
              {title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={styles.companionProgress}>
              {Math.round(scrollProgress)}% read
            </span>
            <div className={styles.companionActions}>
              <button
                type="button"
                onClick={handleCopy}
                className={`${styles.shareBtn} ${copied ? styles.shareBtnActive : ''}`}
                title="Copy link"
                aria-label={copied ? 'Link copied' : 'Copy link'}
              >
                {copied ? '✓ Copied' : '🔗 Copy'}
              </button>
              <a
                href={twitterShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.shareBtn}
                title="Share on X (Twitter)"
                aria-label="Share on X"
              >
                𝕏
              </a>
              <a
                href={linkedInShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.shareBtn}
                title="Share on LinkedIn"
                aria-label="Share on LinkedIn"
              >
                in
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* Share Actions in Article Header */}
      <div className={styles.shareActions}>
        <button
          type="button"
          onClick={handleCopy}
          className={`${styles.shareBtn} ${copied ? styles.shareBtnActive : ''}`}
          title="Copy link to clipboard"
          aria-label={copied ? 'Link copied' : 'Copy link'}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Copy Link</span>
            </>
          )}
        </button>

        <a
          href={twitterShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.shareBtn}
          title="Share on X"
          aria-label="Share on X"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>

        <a
          href={linkedInShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.shareBtn}
          title="Share on LinkedIn"
          aria-label="Share on LinkedIn"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.32a1.64 1.64 0 0 0-1.66 1.64 1.65 1.65 0 0 0 1.66 1.65 1.65 1.65 0 0 0 1.65-1.65 1.64 1.64 0 0 0-1.65-1.64z" />
          </svg>
        </a>
      </div>
    </>
  );
}
