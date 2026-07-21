import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

// Persistent desktop call-to-action, fixed bottom-right and hidden on mobile
// (the header + optional sticky bar cover mobile). Keeps a call/quote one click
// away after the visitor scrolls past the hero form — Forge's header is absolute
// and Guild's is static, so both otherwise have no CTA on scroll. (Vista's
// header is sticky, so it doesn't render this.)
export default function SiteDesktopCta({ site }: { site: Site }) {
  return (
    <div className={styles.desktopCta}>
      {site.phone && (
        <a className={styles.desktopCtaCall} href={`tel:${site.phone}`}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>
          Call
        </a>
      )}
      <a className={styles.desktopCtaQuote} href="#contact">Free quote</a>
    </div>
  );
}
