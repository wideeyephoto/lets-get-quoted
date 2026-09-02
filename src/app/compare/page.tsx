import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import ComprehensiveComparisonMatrix from '@/components/marketing/ComprehensiveComparisonMatrix';
import CompetitorSavingsCalculator from '@/components/marketing/CompetitorSavingsCalculator';
import StackCostComparison from '@/components/marketing/StackCostComparison';
import CompareTradeSwitcher from '@/components/marketing/CompareTradeSwitcher';
import CompareStickyBar from '@/components/marketing/CompareStickyBar';
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

const COMPARE_HUB_FAQS = [
  {
    q: 'Can I keep my existing phone number and website domain?',
    a: 'Yes. You can connect your existing custom domain (e.g., yourcontracting.com) with automated SSL security for free. For phone calls, you can forward calls to your dedicated Let’s Get Quoted number or link your existing line for unified 2-way texting.',
  },
  {
    q: 'How does the $0/month Flex plan work during slow winter months or weather delays?',
    a: 'Unlike legacy platforms that charge $150–$349+ every month whether you book jobs or not, Flex has a $0/month base subscription. You only pay a transparent 1.25% platform fee when a homeowner pays an invoice through Stripe. If you have zero jobs in a month, your software bill is $0.',
  },
  {
    q: 'How long does it take to migrate my clients and past jobs from Jobber, Housecall Pro, or ServiceTitan?',
    a: 'Less than 15 minutes. Simply export your customer directory CSV from your current software and upload it under Dashboard > Clients > Import. All customer names, phone numbers, addresses, and notes map automatically with zero data loss.',
  },
  {
    q: 'How do payments and bank payouts work compared to proprietary merchant rails?',
    a: 'Let’s Get Quoted connects directly to your own Stripe account. Payouts flow straight to your bank account with complete fee transparency. Homeowners can approve quotes and pay deposits via Apple Pay, Google Pay, credit cards, or bank ACH.',
  },
  {
    q: 'Does Let’s Get Quoted sync with QuickBooks Online?',
    a: 'Yes. QuickBooks Online 2-way sync is available so your customers, invoices, line items, and payment transactions stay reconciled without duplicate data entry.',
  },
  {
    q: 'Are there any contracts, cancellation fees, or setup fees?',
    a: 'None. There are zero setup fees, zero contracts, and zero cancellation penalties. You can upgrade, downgrade, or cancel at any time directly from your account settings.',
  },
];

export default async function CompareHubPage() {
  const nonce = await cspNonce();

  const hubJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Compare Contractor Software Alternatives · Let’s Get Quoted',
      description:
        'Side-by-side comparison of Let’s Get Quoted against Jobber, Housecall Pro, ServiceTitan, Angi, and Thumbtack.',
      url: 'https://letsgetquoted.com/compare',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: COMPARE_HUB_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.a,
        },
      })),
    },
  ];

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
            websites and pay for shared leads. See how Let’s Get Quoted compares side-by-side.
          </p>

          <div className={styles.heroActions}>
            <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
              Start Free on Flex ($0/mo) &rarr;
            </Link>
            <Link href="#savings-calculator" className={styles.btnSecondary}>
              Calculate Your Savings &darr;
            </Link>
          </div>
        </section>

        {/* 1. Unified Cross-Service Comparison Matrix (Features on Y-Axis) */}
        <ComprehensiveComparisonMatrix />

        {/* 2. Interactive Competitor ROI & Savings Calculator */}
        <CompetitorSavingsCalculator allowCompetitorSwitch={true} competitorName="Jobber" />

        {/* 3. The Fragmented Multi-App Stack vs Unified Platform */}
        <StackCostComparison allowCompetitorSwitch={true} competitorName="Jobber" />

        {/* 4. Trade-Specific Playbook Switcher */}
        <CompareTradeSwitcher competitorName="Legacy Software" />

        {/* 5. 3-Step Painless Migration Flow & Guarantees */}
        <section className={styles.migrationSection} aria-label="Migration process and guarantees">
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>✦ 15-Minute Switch</span>
            <h2>Switch platforms without losing a single customer</h2>
            <p>
              Moving to Let’s Get Quoted is self-serve and zero-risk. Keep running your current tools while you
              set up your website and import your customer book in under 15 minutes.
            </p>
          </div>

          <div className={styles.migrationGrid}>
            <div className={styles.migrationCard}>
              <span className={styles.stepNumberBadge}>Step 1 · 60 Seconds</span>
              <h3 className={styles.stepTitle}>Export your client list</h3>
              <p className={styles.stepDesc}>
                Download your contacts, phone numbers, and addresses in CSV format from Jobber, Housecall Pro,
                or ServiceTitan settings.
              </p>
              <span className={styles.stepNote}>✓ Zero data loss guarantee</span>
            </div>

            <div className={styles.migrationCard}>
              <span className={styles.stepNumberBadge}>Step 2 · 1-Click</span>
              <h3 className={styles.stepTitle}>Auto-import into LGQ</h3>
              <p className={styles.stepDesc}>
                Upload your CSV under Dashboard &gt; Clients &gt; Import. Customer records and phone numbers map
                automatically.
              </p>
              <span className={styles.stepNote}>✓ Instant field matching</span>
            </div>

            <div className={styles.migrationCard}>
              <span className={styles.stepNumberBadge}>Step 3 · 15 Minutes</span>
              <h3 className={styles.stepTitle}>Launch &amp; start quoting</h3>
              <p className={styles.stepDesc}>
                Pick your trade website theme, connect your Stripe account, and send your first mobile quote with
                e-signatures.
              </p>
              <span className={styles.stepNote}>✓ Free concierge onboarding</span>
            </div>
          </div>

          <div className={styles.guaranteeGrid}>
            <div className={styles.guaranteeCard}>
              <span className={styles.guaranteeIcon} aria-hidden="true">🔄</span>
              <div>
                <h4 className={styles.guaranteeTitle}>Dual-Run Guarantee</h4>
                <p className={styles.guaranteeText}>
                  Set up your website and test quote workflows with $0 overhead while your old software runs out its billing cycle.
                </p>
              </div>
            </div>

            <div className={styles.guaranteeCard}>
              <span className={styles.guaranteeIcon} aria-hidden="true">🤝</span>
              <div>
                <h4 className={styles.guaranteeTitle}>Concierge Data Migration</h4>
                <p className={styles.guaranteeText}>
                  Have a messy spreadsheet or complex price book? Our team will clean, format, and import your records for free.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Competitor Deep-Dive Hub Cards */}
        <div className={styles.sectionHeader}>
          <span className={styles.kicker}>✦ In-Depth Platform Analysis</span>
          <h2>Drill down into individual competitor breakdowns</h2>
          <p>
            Explore detailed ROI calculators, migration timelines, and transparent feature-by-feature audits for
            each platform.
          </p>
        </div>

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

        {/* 7. Common Objections & FAQs Accordion */}
        <section className={styles.faqSection} aria-label="Frequently asked comparison questions">
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>✦ Transparent Answers</span>
            <h2>Frequently Asked Questions</h2>
            <p>Everything you need to know about switching your business to Let’s Get Quoted.</p>
          </div>

          <div className={styles.faqList}>
            {COMPARE_HUB_FAQS.map((faq, idx) => (
              <details key={idx} className={styles.faqItem}>
                <summary className={styles.faqSummary}>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 8. Closing CTA */}
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

      <CompareStickyBar competitorName="Legacy Software" />
      <SiteFooter />
    </div>
  );
}
