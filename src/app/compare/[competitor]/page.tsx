import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
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
      <SiteHeader />

      <main>
        <section className={styles.hero}>
          <span className={styles.badge}>{data.badge}</span>
          <h1 className={styles.headline}>
            {data.headline}
          </h1>
          <p className={styles.subhead}>{data.subhead}</p>

          <div className={styles.heroActions}>
            <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
              Start Free on Flex ($0/mo) &rarr;
            </Link>
            <Link href="/pricing" className={styles.btnSecondary}>
              Compare Plan Features &rarr;
            </Link>
          </div>
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

        {/* Feature Comparison Table */}
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h2>Side-by-Side Comparison</h2>
            <p>Direct comparison of core features, website builder, lead capture, and pricing.</p>
          </div>

          <table className={styles.tableShell} aria-label={`Comparison table: Let's Get Quoted vs ${data.name}`}>
            <thead>
              <tr>
                <th scope="col" style={{ width: '25%' }}>Feature</th>
                <th scope="col" style={{ width: '38%' }}>Let’s Get Quoted</th>
                <th scope="col" style={{ width: '37%' }}>{data.name}</th>
              </tr>
            </thead>
            <tbody>
              {data.tableRows.map((row) => (
                <tr key={row.feature}>
                  <td><strong>{row.feature}</strong></td>
                  <td className={styles.lgqCol}>
                    ✓ {row.lgq}
                    <div style={{ fontSize: '12px', color: '#a7bcc8', marginTop: '4px', fontWeight: 'normal' }}>
                      {row.detail}
                    </div>
                  </td>
                  <td>{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* FAQ Section */}
        <section className={styles.faqSection} aria-label="Frequently Asked Questions">
          <div className={styles.sectionHeader}>
            <h2>Frequently Asked Questions</h2>
            <p>Common questions from contractors switching from {data.name}.</p>
          </div>

          {data.faqs.map((faq) => (
            <details key={faq.q} className={styles.faqItem}>
              <summary className={styles.faqSummary}>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </section>

        {/* Closing CTA */}
        <section className={styles.ctaBand}>
          <h2>Switch to the platform built for contractor profit.</h2>
          <p>
            Zero setup fees. Free onboarding. Keep your customer relationships, automate your quotes, and get paid
            faster with Let’s Get Quoted.
          </p>
          <Link href={APP_SIGNUP_URL} className={styles.btnPrimary}>
            Start Free on Flex in 2 Minutes &rarr;
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
