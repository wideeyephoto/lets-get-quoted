import type { Metadata } from 'next';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import CompetitorSavingsCalculator from '@/components/marketing/CompetitorSavingsCalculator';
import StackCostComparison from '@/components/marketing/StackCostComparison';
import CompareTradeSwitcher from '@/components/marketing/CompareTradeSwitcher';
import SmsQuoteSimulator from '@/components/marketing/SmsQuoteSimulator';
import AiIntakeSandbox from '@/components/marketing/AiIntakeSandbox';
import CompareStickyBar from '@/components/marketing/CompareStickyBar';
import { cspNonce } from '@/lib/csp-nonce';
import { COMPARISONS, type CompetitorDetail } from '../compare-data';
import styles from '../compare.module.css';

type Props = {
  params: {
    competitor: string;
  };
};

export async function generateStaticParams() {
  return Object.keys(COMPARISONS).map((slug) => ({
    competitor: slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = COMPARISONS[params.competitor];
  if (!data) {
    return {
      title: 'Compare Contractor Software',
    };
  }

  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `https://letsgetquoted.com/compare/${data.slug}` },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url: `https://letsgetquoted.com/compare/${data.slug}`,
      type: 'website',
    },
  };
}

export default function CompetitorDetailPage({ params }: Props) {
  const data: CompetitorDetail | undefined = COMPARISONS[params.competitor];
  if (!data) {
    notFound();
  }

  const nonce = cspNonce();

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      description: data.metaDescription,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Flex plan starts at $0/month with transparent 1.25% platform fee.',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.a,
        },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://letsgetquoted.com',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Compare',
          item: 'https://letsgetquoted.com/compare',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: data.badge,
          item: `https://letsgetquoted.com/compare/${data.slug}`,
        },
      ],
    },
  ];

  return (
    <div className={styles.page}>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main-content">
        {/* Hero Section */}
        <section className={styles.hero}>
          <span className={styles.badge}>✦ {data.badge}</span>
          <h1 className={styles.headline}>
            {data.slug === 'jobber-alternative' ? (
              <>A Modern Contractor Platform with <em>$0/Mo Entry</em> &amp; <em>Built-In AI Intake</em>.</>
            ) : data.slug === 'housecall-pro-alternative' ? (
              <>Contractor Software Without <em>Surprise Add-Ons</em> &amp; <em>Seat Penalties</em>.</>
            ) : data.slug === 'servicetitan-alternative' ? (
              <>Contractor Software Without <em>$5,000 Setup Fees</em> &amp; <em>Locked Contracts</em>.</>
            ) : data.slug === 'angi-leads-alternative' ? (
              <>Own Your Leads. <em>Stop Paying $80+</em> for Shared Inquiries.</>
            ) : data.slug === 'thumbtack-alternative' ? (
              <>Stop Paying for Every Message. <em>Own Your Direct Leads</em>.</>
            ) : (
              data.headline
            )}
          </h1>
          <p className={styles.subhead}>{data.subhead}</p>

          <div className={styles.heroActions}>
            <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
              Start Free on Flex ($0/mo) &rarr;
            </Link>
            <Link href="#savings-calculator" className={styles.btnSecondary}>
              Calculate Annual Savings &darr;
            </Link>
          </div>

          {/* Hero Side-by-Side Snapshot Comparison Card */}
          <div className={styles.heroSnapshotGrid} aria-label={`Quick comparison: Let's Get Quoted vs ${data.name}`}>
            {/* Competitor Snapshot Box */}
            <div className={styles.heroSnapshotCardComp}>
              <div className={styles.heroSnapshotHeadComp}>
                <span className={styles.heroSnapshotBrand}>{data.name}</span>
                <span className={styles.heroSnapshotPriceComp}>
                  {data.basePricing.competitor.split('+')[0].trim()}
                </span>
              </div>
              <ul className={styles.heroSnapshotList}>
                <li>
                  <span className={styles.crossIcon}>✕</span>
                  <span>Recurring monthly SaaS bills even during slow months</span>
                </li>
                <li>
                  <span className={styles.crossIcon}>✕</span>
                  <span>No custom contractor website included (requires Wix/Squarespace)</span>
                </li>
                <li>
                  <span className={styles.crossIcon}>✕</span>
                  <span>Basic static forms without automated 24/7 AI lead scoping</span>
                </li>
              </ul>
            </div>

            {/* LGQ Snapshot Box (Winner) */}
            <div className={styles.heroSnapshotCardLgq}>
              <div className={styles.heroSnapshotTagLgq}>Built for Contractor Profit</div>
              <div className={styles.heroSnapshotHeadLgq}>
                <span className={styles.heroSnapshotBrandLgq}>Let’s Get Quoted</span>
                <span className={styles.heroSnapshotPriceLgq}>From $0/mo on Flex</span>
              </div>
              <ul className={styles.heroSnapshotList}>
                <li>
                  <span className={styles.checkIconTeal}>✓</span>
                  <span><strong>$0/month base software overhead</strong> · Pay only 1.25% when you get paid</span>
                </li>
                <li>
                  <span className={styles.checkIconTeal}>✓</span>
                  <span><strong>SEO contractor website included</strong> with 20+ trade themes &amp; instant booking</span>
                </li>
                <li>
                  <span className={styles.checkIconTeal}>✓</span>
                  <span><strong>24/7 AI Smart Intake</strong> qualifying, scoping &amp; alerting hot leads instantly</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Trust Badges */}
          {data.trustBadges && data.trustBadges.length > 0 && (
            <div className={styles.trustBadgesRow} aria-label="Key guarantees">
              {data.trustBadges.map((badge) => (
                <div key={badge} className={styles.trustBadgeItem}>
                  <span className={styles.trustCheck}>✓</span>
                  <span>{badge}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Key Structural Differences */}
        <section className={styles.diffGrid} aria-label="Key differences">
          {data.keyDifferences.map((diff) => (
            <article key={diff.title} className={styles.diffCard}>
              <h3>✦ {diff.title}</h3>
              <p>{diff.description}</p>
            </article>
          ))}
        </section>

        {/* Interactive Stack Cost Comparison */}
        <StackCostComparison competitorName={data.name} />

        {/* Interactive Savings & ROI Calculator */}
        <CompetitorSavingsCalculator competitorName={data.name} />

        {/* Trade-Specific Scenarios Switcher */}
        <CompareTradeSwitcher competitorName={data.name} />

        {/* Visual Product Pillars */}
        {data.visualPillars && data.visualPillars.length > 0 && (
          <section className={styles.pillarsSection} aria-label="Product features and proof">
            <div className={styles.sectionHeader}>
              <span className={styles.kicker}>Why Contractors Switch</span>
              <h2>Built for Contractor Profits, Not Subscription Overhead</h2>
              <p>See the real product in action. Every tool designed to win jobs, save time, and protect your cash flow.</p>
            </div>

            <div className={styles.pillarsGrid}>
              {data.visualPillars.map((pillar, idx) => (
                <article
                  key={pillar.title}
                  className={`${styles.pillarCard} ${idx % 2 === 1 ? styles.pillarCardReverse : ''}`}
                >
                  <div className={styles.pillarCopy}>
                    <span className={styles.pillarEyebrow}>✦ {pillar.eyebrow}</span>
                    <h3 className={styles.pillarTitle}>{pillar.title}</h3>
                    <p className={styles.pillarDescription}>{pillar.description}</p>
                    <ul className={styles.pillarHighlights}>
                      {pillar.highlights.map((item) => (
                        <li key={item}>
                          <span className={styles.pillarCheck}>✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.pillarVisual}>
                    <Image
                      src={`/features/${pillar.image}.jpg`}
                      alt={pillar.alt}
                      width={1200}
                      height={750}
                      sizes="(max-width: 900px) 100vw, 50vw"
                      className={styles.pillarImage}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Live Interactive AI Lead Intake Sandbox */}
        <AiIntakeSandbox />

        {/* Instant SMS Quote Simulator */}
        <section className={styles.simulatorSection} aria-label="Live SMS and Quote Experience">
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>Homeowner Experience</span>
            <h2>Experience What Your Customers See &amp; E-Sign</h2>
            <p>
              Test how an inbound text description turns into a signed quote and an instant Apple Pay deposit in 60 seconds.
            </p>
          </div>
          <SmsQuoteSimulator />
        </section>

        {/* Categorized Side-by-Side Comparison Matrix */}
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>Side-by-Side Comparison</span>
            <h2>How Let’s Get Quoted Compares to {data.name}</h2>
            <p>A direct, transparent feature and pricing breakdown.</p>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.tableShell} aria-label={`Comparison table: Let's Get Quoted vs ${data.name}`}>
              <thead>
                <tr>
                  <th scope="col" style={{ width: '28%' }}>Feature &amp; Capability</th>
                  <th scope="col" style={{ width: '38%' }}>Let’s Get Quoted</th>
                  <th scope="col" style={{ width: '34%' }}>{data.name}</th>
                </tr>
              </thead>
              <tbody>
                {data.categories && data.categories.length > 0 ? (
                  data.categories.map((cat) => (
                    <React.Fragment key={cat.category}>
                      <tr className={styles.categoryHeaderRow}>
                        <td colSpan={3}>
                          <strong>{cat.category}</strong>
                        </td>
                      </tr>
                      {cat.rows.map((row) => (
                        <tr key={row.feature}>
                          <td><strong>{row.feature}</strong></td>
                          <td className={styles.lgqCol}>
                            <div className={styles.lgqVal}>
                              <span className={styles.checkIcon}>✓</span>
                              <span>{row.lgq}</span>
                            </div>
                            <div className={styles.detailText}>{row.detail}</div>
                          </td>
                          <td className={styles.compCol}>
                            <div className={styles.compVal}>{row.competitor}</div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  data.tableRows.map((row) => (
                    <tr key={row.feature}>
                      <td><strong>{row.feature}</strong></td>
                      <td className={styles.lgqCol}>
                        <div className={styles.lgqVal}>
                          <span className={styles.checkIcon}>✓</span>
                          <span>{row.lgq}</span>
                        </div>
                        <div className={styles.detailText}>{row.detail}</div>
                      </td>
                      <td className={styles.compCol}>
                        <div className={styles.compVal}>{row.competitor}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3-Step Migration Blueprint */}
        {data.migrationSteps && data.migrationSteps.length > 0 && (
          <section className={styles.migrationSection} aria-label="Switching process">
            <div className={styles.sectionHeader}>
              <span className={styles.kicker}>Frictionless Migration</span>
              <h2>Switch from {data.name} in Under 15 Minutes</h2>
              <p>Zero downtime. Zero customer data lost. Start sending quotes today.</p>
            </div>

            <div className={styles.migrationGrid}>
              {data.migrationSteps.map((step) => (
                <div key={step.step} className={styles.migrationCard}>
                  <div className={styles.stepNumberBadge}>Step 0{step.step}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDesc}>{step.description}</p>
                  <div className={styles.stepNote}>✦ {step.note}</div>
                </div>
              ))}
            </div>

            {/* Concierge & Dual-Run Guarantee Cards */}
            <div className={styles.guaranteeGrid}>
              <div className={styles.guaranteeCard}>
                <div className={styles.guaranteeIcon}>🛡️</div>
                <div>
                  <h4 className={styles.guaranteeTitle}>30-Day Zero-Risk Dual Run</h4>
                  <p className={styles.guaranteeText}>
                    Keep {data.name} active while you set up Let’s Get Quoted. Test your new website, send quotes, and verify payouts before canceling {data.name}.
                  </p>
                </div>
              </div>

              <div className={styles.guaranteeCard}>
                <div className={styles.guaranteeIcon}>⚡</div>
                <div>
                  <h4 className={styles.guaranteeTitle}>Free CSV Concierge Assistance</h4>
                  <p className={styles.guaranteeText}>
                    Have a large client database or price book? Upload your file or message our support team for free migration assistance within 24 hours.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Objective Fit Guide */}
        {data.honestFit && (
          <section className={styles.honestFitSection} aria-label="Objective platform fit">
            <div className={styles.sectionHeader}>
              <span className={styles.kicker}>Honest Comparison</span>
              <h2>Which Platform Is the Right Fit for Your Business?</h2>
            </div>

            <div className={styles.honestFitGrid}>
              <div className={styles.fitCardComp}>
                <h3 className={styles.fitTitleComp}>{data.honestFit.competitorTitle}</h3>
                <ul className={styles.fitList}>
                  {data.honestFit.competitorPoints.map((pt) => (
                    <li key={pt}>
                      <span className={styles.bulletComp}>•</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.fitCardLgq}>
                <div className={styles.fitHighlight}>Recommended for Trade Contractors</div>
                <h3 className={styles.fitTitleLgq}>{data.honestFit.lgqTitle}</h3>
                <ul className={styles.fitList}>
                  {data.honestFit.lgqPoints.map((pt) => (
                    <li key={pt}>
                      <span className={styles.bulletLgq}>✓</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.fitCta}>
                  <Link href={APP_SIGNUP_URL} className={styles.btnPrimarySmall}>
                    Get Started Free on Flex &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section className={styles.faqSection} aria-label="Frequently Asked Questions">
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>Answers</span>
            <h2>Frequently Asked Questions</h2>
            <p>Common questions from contractors evaluating an alternative to {data.name}.</p>
          </div>

          <div className={styles.faqList}>
            {data.faqs.map((faq) => (
              <details key={faq.q} className={styles.faqItem}>
                <summary className={styles.faqSummary}>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Trade Solutions Cross-Links */}
        <section className={styles.faqSection} aria-label="Trade-specific solutions">
          <div className={styles.sectionHeader}>
            <span className={styles.kicker}>Tailored Solutions</span>
            <h2>Built &amp; Pre-configured for Your Trade</h2>
            <p>
              Explore how Let’s Get Quoted gives contractors in your trade a free marketing website, 24/7 AI scoping,
              instant estimates, and fast payments from $0/month.
            </p>
          </div>

          <div className={styles.diffGrid}>
            <Link href="/for/plumbers" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>Plumbers &rarr;</h3>
              <p className={styles.diffDesc}>24/7 emergency dispatch, water heater scoping, and same-day flat-rate diagnostics.</p>
            </Link>
            <Link href="/for/electricians" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>Electricians &rarr;</h3>
              <p className={styles.diffDesc}>Panel upgrade scoping questionnaires, EV charger intake, and instant mobile quotes.</p>
            </Link>
            <Link href="/for/hvac" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>HVAC Contractors &rarr;</h3>
              <p className={styles.diffDesc}>System changeout proposals, seasonal tune-up self-scheduling, and Good/Better/Best tiers.</p>
            </Link>
            <Link href="/for/roofers" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>Roofers &rarr;</h3>
              <p className={styles.diffDesc}>Storm damage intake, roof square calculators, and deposit-gated calendar bookings.</p>
            </Link>
            <Link href="/for/landscapers" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>Landscapers &rarr;</h3>
              <p className={styles.diffDesc}>Hardscaping &amp; patio estimates, sod calculators, and recurring monthly maintenance billing.</p>
            </Link>
            <Link href="/for/remodelers" className={styles.diffCard} style={{ textDecoration: 'none' }}>
              <h3 className={styles.diffTitle}>Remodelers &rarr;</h3>
              <p className={styles.diffDesc}>Kitchen &amp; bath proposals, staged milestone progress payments, and interactive client portals.</p>
            </Link>
          </div>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <Link href="/for" className={styles.btnSecondary}>
              Explore all 150 supported contractor trades &rarr;
            </Link>
          </div>
        </section>

        {/* Closing CTA */}
        <section className={styles.ctaBand}>
          <span className={styles.badge}>Zero Risk Guarantee</span>
          <h2>Switch to the platform built for contractor profit.</h2>
          <p>
            Zero setup fees. Free onboarding. Keep your customer relationships, automate your quotes, and get paid
            faster with Let’s Get Quoted.
          </p>
          <div className={styles.heroActions}>
            <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
              Start Free on Flex in 2 Minutes &rarr;
            </Link>
            <Link href="/pricing" className={styles.btnSecondary}>
              Explore Full Pricing &rarr;
            </Link>
          </div>
        </section>
      </main>

      {/* Floating Sticky Conversion Bar */}
      <CompareStickyBar competitorName={data.name} />

      <SiteFooter />
    </div>
  );
}
