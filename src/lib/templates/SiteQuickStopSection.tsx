import React from 'react';
import type { SiteQuickStopContent } from '@/lib/site-content';
import styles from './SiteQuickStopSection.module.css';

export default function SiteQuickStopSection({
  style,
  eyebrow,
  title,
  intro,
  badgeText,
  feeNote,
  ctaLabel,
  ctaHref,
  items,
}: SiteQuickStopContent) {
  const targetHref = ctaHref?.trim() || '#contact';
  const buttonText = ctaLabel?.trim() || 'Request a Quick Stop';

  // ── STYLE 1: CARDS (Feature Pillar Grid) ──────────────────────────
  if (style === 'cards') {
    return (
      <section className={styles.quickStopSection} id="quick-stop" data-quick-stop-style="cards">
        <div className={styles.quickStopHeader} data-reveal>
          {badgeText ? <div className={styles.badgePill}>{badgeText}</div> : null}
          {eyebrow ? <p className={styles.kicker}>{eyebrow}</p> : null}
          <h2>{title}</h2>
          {intro ? <p>{intro}</p> : null}
        </div>

        <div className={styles.cardsGrid} data-stagger>
          {items.map((item) => (
            <article key={item.id} className={styles.featureCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon} aria-hidden="true">
                  {item.icon || '⚡'}
                </span>
                {item.badge ? <span className={styles.cardBadge}>{item.badge}</span> : null}
              </div>
              <h3>{item.title}</h3>
              {item.description ? <p>{item.description}</p> : null}
            </article>
          ))}
        </div>

        <div className={styles.cardsFooter} data-reveal>
          {feeNote ? <span className={styles.feeNote}>✓ {feeNote}</span> : null}
          <a href={targetHref} className={styles.ctaBtn}>
            {buttonText} →
          </a>
        </div>
      </section>
    );
  }

  // ── STYLE 2: BANNER (Express Route Highlight Ribbon) ──────────────
  if (style === 'banner') {
    return (
      <section className={styles.quickStopSection} id="quick-stop" data-quick-stop-style="banner">
        <div className={styles.bannerContainer} data-reveal>
          <div className={styles.bannerGrid}>
            <div className={styles.bannerLeft}>
              <div className={styles.badgePill}>{badgeText || '⚡ Quick Stop Express'}</div>
              {eyebrow ? <p className={styles.kicker}>{eyebrow}</p> : null}
              <h3>{title}</h3>
              {intro ? <p>{intro}</p> : null}
              <div className={styles.bannerActions}>
                <a href={targetHref} className={styles.ctaBtn}>
                  {buttonText} →
                </a>
                {feeNote ? <span className={styles.feeNote}>✓ {feeNote}</span> : null}
              </div>
            </div>

            <div className={styles.bannerRight}>
              {items.map((item) => (
                <div key={item.id} className={styles.bannerBullet}>
                  <span className={styles.bulletIcon} aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    {item.description ? <p style={{ margin: '0.15rem 0 0', opacity: 0.85, fontSize: '0.82rem' }}>{item.description}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── STYLE 3: TIMELINE (Connected 4-Step Process Flow) ─────────────
  if (style === 'timeline') {
    return (
      <section className={styles.quickStopSection} id="quick-stop" data-quick-stop-style="timeline">
        <div className={styles.quickStopHeader} data-reveal>
          {badgeText ? <div className={styles.badgePill}>{badgeText}</div> : null}
          {eyebrow ? <p className={styles.kicker}>{eyebrow}</p> : null}
          <h2>{title}</h2>
          {intro ? <p>{intro}</p> : null}
        </div>

        <div className={styles.timelineWrapper}>
          <ol className={styles.timelineGrid} data-stagger style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((step, idx) => (
              <li key={step.id} className={styles.timelineStep}>
                <div className={styles.stepNumber} aria-hidden="true">
                  {idx + 1}
                </div>
                <h3>
                  <span aria-hidden="true" style={{ marginRight: '0.35rem' }}>
                    {step.icon || '⚡'}
                  </span>
                  {step.title}
                </h3>
                {step.description ? <p>{step.description}</p> : null}
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.cardsFooter} data-reveal>
          {feeNote ? <span className={styles.feeNote}>✓ {feeNote}</span> : null}
          <a href={targetHref} className={styles.ctaBtn}>
            {buttonText} →
          </a>
        </div>
      </section>
    );
  }

  // ── STYLE 4: COMPARISON (Quick Stop vs. Standard Project Table) ───
  return (
    <section className={styles.quickStopSection} id="quick-stop" data-quick-stop-style="comparison">
      <div className={styles.quickStopHeader} data-reveal>
        {badgeText ? <div className={styles.badgePill}>{badgeText}</div> : null}
        {eyebrow ? <p className={styles.kicker}>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {intro ? <p>{intro}</p> : null}
      </div>

      <div className={styles.comparisonDeck} data-stagger>
        {/* Left: Quick Stop Priority Visit */}
        <div className={`${styles.compareCard} ${styles.compareFeatured}`}>
          <div className={styles.compareHeader}>
            <span className={styles.badgePill} style={{ marginBottom: '0.4rem' }}>
              ⚡ Fastest Option
            </span>
            <h3>Quick Stop Priority Visit</h3>
            <p>Squeezed into existing daily route gaps</p>
          </div>

          <ul className={styles.compareList}>
            <li className={styles.compareItem}>
              <span className={styles.compareIcon}>✓</span>
              <span><strong>Scope:</strong> Small repairs, diagnostics &amp; adjustments (15–45m)</span>
            </li>
            <li className={styles.compareItem}>
              <span className={styles.compareIcon}>✓</span>
              <span><strong>Turnaround:</strong> Today or tomorrow in route gaps</span>
            </li>
            <li className={styles.compareItem}>
              <span className={styles.compareIcon}>✓</span>
              <span><strong>Pricing:</strong> Upfront flat priority visit fee</span>
            </li>
            <li className={styles.compareItem}>
              <span className={styles.compareIcon}>✓</span>
              <span><strong>Updates:</strong> Live text alerts with 15-min ETA en route</span>
            </li>
          </ul>

          <a href={targetHref} className={styles.ctaBtn} style={{ marginTop: 'auto' }}>
            {buttonText} →
          </a>
        </div>

        {/* Right: Standard Full Project */}
        <div className={styles.compareCard}>
          <div className={styles.compareHeader}>
            <span className={styles.cardBadge} style={{ marginBottom: '0.4rem', display: 'inline-block' }}>
              📅 Standard Scheduling
            </span>
            <h3>Full Project Booking</h3>
            <p>Comprehensive quotes &amp; full installations</p>
          </div>

          <ul className={styles.compareList}>
            <li className={styles.compareItem}>
              <span className={`${styles.compareIcon} ${styles.compareDim}`}>•</span>
              <span><strong>Scope:</strong> Full repipes, system replacements &amp; renovations</span>
            </li>
            <li className={styles.compareItem}>
              <span className={`${styles.compareIcon} ${styles.compareDim}`}>•</span>
              <span><strong>Turnaround:</strong> Scheduled advance appointment slots</span>
            </li>
            <li className={styles.compareItem}>
              <span className={`${styles.compareIcon} ${styles.compareDim}`}>•</span>
              <span><strong>Pricing:</strong> Comprehensive custom proposal</span>
            </li>
            <li className={styles.compareItem}>
              <span className={`${styles.compareIcon} ${styles.compareDim}`}>•</span>
              <span><strong>Consultation:</strong> Dedicated on-site assessment</span>
            </li>
          </ul>

          <a href="#contact" className={styles.ctaSecondaryBtn} style={{ marginTop: 'auto' }}>
            Request Full Estimate →
          </a>
        </div>
      </div>
    </section>
  );
}
