import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { cspNonce } from '@/lib/csp-nonce';
import { COMPARISONS } from './compare-data';
import styles from './compare.module.css';

export const metadata: Metadata = {
  title: 'Compare Contractor Software & Alternatives',
  description:
    'Compare Let’s Get Quoted with legacy contractor tools like Jobber, Housecall Pro, ServiceTitan, Angi, and Thumbtack. See transparent pricing and feature breakdowns.',
  alternates: { canonical: 'https://letsgetquoted.com/compare' },
  openGraph: {
    title: 'Compare Contractor Software & Alternatives',
    description:
      'Compare Let’s Get Quoted vs Jobber, Housecall Pro, ServiceTitan, and Angi. Start at $0/month with free contractor websites and built-in AI intake.',
    url: 'https://letsgetquoted.com/compare',
    type: 'website',
  },
};

export default async function CompareHubPage() {
  const nonce = await cspNonce();

  const hubJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Compare Contractor Software Alternatives · Let’s Get Quoted',
    description:
      'Side-by-side comparison of Let’s Get Quoted against Jobber, Housecall Pro, ServiceTitan, Angi, and Thumbtack.',
    url: 'https://letsgetquoted.com/compare',
  };

  return (
    <div className={styles.page}>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJsonLd) }}
      />

      <main id="main-content">
        <section className={styles.hero}>
          <span className={styles.badge}>Fair &amp; Honest Comparison</span>
          <h1 className={styles.headline}>
            The contractor software built for <em>your profits</em>, not subscription bloat.
          </h1>
          <p className={styles.subhead}>
            Legacy platforms charge $150–$1,000+ every month whether you book jobs or not—and still make you buy
            websites and pay for shared leads. See how Let’s Get Quoted compares.
          </p>

          <div className={styles.heroActions}>
            <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
              Start Free on Flex ($0/mo) &rarr;
            </Link>
            <Link href="/pricing" className={styles.btnSecondary}>
              Explore Full Pricing &rarr;
            </Link>
          </div>
        </section>

        {/* Competitor Hub Cards */}
        <section className={styles.hubGrid} aria-label="Competitor comparison directory">
          {Object.values(COMPARISONS).map((comp) => (
            <article key={comp.slug} className={styles.hubCard}>
              <div className={styles.hubCardBadge}>✦ {comp.badge}</div>
              <h2 className={styles.hubCardTitle}>LGQ vs. {comp.name}</h2>
              <div className={styles.hubCardPrice}>{comp.basePricing.competitor}</div>
              <p className={styles.hubCardBody}>{comp.summary}</p>
              <Link href={`/compare/${comp.slug}`} className={styles.hubCardLink}>
                View full {comp.name} comparison &rarr;
              </Link>
            </article>
          ))}
        </section>

        {/* Closing CTA */}
        <section className={styles.ctaBand}>
          <span className={styles.badge}>Performance-Aligned Pricing</span>
          <h2>Ready to keep more money on every job?</h2>
          <p>
            Join contractors who replaced multiple monthly software bills with one unified platform. Free website,
            smart lead intake, and fast payments starting at $0/month.
          </p>
          <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
            Create Your Account in 2 Minutes &rarr;
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
