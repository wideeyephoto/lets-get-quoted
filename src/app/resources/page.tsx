import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { cspNonce } from '@/lib/csp-nonce';
import { ARTICLES } from '@/lib/resources';
import ResourceLibrary from './ResourceLibrary';
import styles from './resources.module.css';

const RESOURCES_URL = 'https://letsgetquoted.com/resources';
const RESOURCES_DESCRIPTION =
  'Practical, no-fluff contractor playbooks: how to price for real profit margin, win high-intent leads, get paid faster, and earn 5-star Google reviews.';

export const metadata: Metadata = {
  title: 'Contractor Guides & Resources · Let’s Get Quoted',
  description: RESOURCES_DESCRIPTION,
  alternates: { canonical: RESOURCES_URL },
  openGraph: {
    title: 'Contractor Guides & Playbooks · Let’s Get Quoted',
    description: RESOURCES_DESCRIPTION,
    url: RESOURCES_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Guides & Playbooks · Let’s Get Quoted',
    description: RESOURCES_DESCRIPTION,
  },
};

export default function ResourcesPage() {
  const nonce = cspNonce();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Let’s Get Quoted Contractor Resource Library',
    description: RESOURCES_DESCRIPTION,
    url: RESOURCES_URL,
    hasPart: ARTICLES.map((article) => ({
      '@type': 'Article',
      headline: article.title,
      description: article.excerpt,
      url: `https://letsgetquoted.com/resources/${article.slug}`,
      datePublished: article.datePublished,
    })),
  };

  return (
    <div className={styles.resourcesTheme}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.siteShell}>
        <div className={`${styles.ambient} ${styles.ambientOne}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientTwo}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientThree}`} aria-hidden="true" />

        <a className="skip-link" href="#main-content">
          Skip to content
        </a>

        <SiteHeader />
        <LaunchBanner offsetHeader />
        <ThemeFab />

        <main id="main-content" className={styles.container}>
          {/* Hero Section */}
          <section className={styles.hero} aria-labelledby="resources-hero-title">
            <div className={styles.eyebrowChip}>
              <span className={styles.pulseDot} aria-hidden="true" />
              <p className={styles.eyebrowText}>Contractor Resource Library &amp; Playbooks</p>
            </div>
            <h1 id="resources-hero-title" className={styles.heroTitle}>
              Straight-talk guides <em>for running a contracting business.</em>
            </h1>
            <p className={styles.heroLede}>
              Battle-tested guidance on pricing for real margin, capturing high-intent leads, getting paid on time, and automating operations—whatever tools you use.
            </p>

            <div className={styles.heroStatsRow}>
              <span className={styles.heroStatItem}>
                <span className={styles.heroStatIcon} aria-hidden="true">✓</span>
                {ARTICLES.length} Comprehensive Playbooks
              </span>
              <span className={styles.heroStatItem}>
                <span className={styles.heroStatIcon} aria-hidden="true">✓</span>
                Interactive Estimating &amp; Margin Tools
              </span>
              <span className={styles.heroStatItem}>
                <span className={styles.heroStatIcon} aria-hidden="true">✓</span>
                100% Free &amp; Open Access
              </span>
            </div>
          </section>

          {/* Interactive Resource Library Component (Spotlight + Finder + Grid) */}
          <ResourceLibrary />

          {/* Closing CTA Band */}
          <section className={styles.ctaBand} aria-labelledby="cta-title">
            <div className={styles.ctaInner}>
              <div className={styles.eyebrowChip}>
                <span aria-hidden="true">✦</span>
                <p className={styles.eyebrowText}>Ready when you are</p>
              </div>
              <h2 id="cta-title">Put the advice to work in your business.</h2>
              <p>
                Start free with Flex at $0/month. Free contractor website, instant estimates, itemized quotes, scheduling, and payments connected in one system.
              </p>
              <div className={styles.ctaActions}>
                <a href={APP_SIGNUP_URL} className={styles.btnPrimary}>
                  Build my free website <span aria-hidden="true">→</span>
                </a>
                <Link href="/features" className={styles.btnSecondary}>
                  Explore all features
                </Link>
                <Link href="/pricing" className={styles.btnSecondary}>
                  Compare pricing plans
                </Link>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
