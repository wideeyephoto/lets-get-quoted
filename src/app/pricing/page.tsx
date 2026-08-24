import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import PricingExperience from './PricingExperience';
import { PRICING_FAQS } from './pricing-catalog';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Contractor Software Pricing',
  description:
    'Flexible contractor software pricing from $0/month. Compare Flex, Solo, Growth, and Scale, and calculate your LGQ platform fee.',
  alternates: { canonical: 'https://letsgetquoted.com/pricing' },
  openGraph: {
    title: 'Contractor Software Pricing · Let’s Get Quoted',
    description:
      'Start at $0/month and reach a 0.1% LGQ platform fee as your contracting business grows.',
    url: 'https://letsgetquoted.com/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Software Pricing · Let’s Get Quoted',
    description: 'Flex, Solo, Growth, and Scale — practical contractor software pricing that grows with you.',
  },
};

export default function PricingPage() {
  const nonce = cspNonce();
  const pricingJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '0',
        highPrice: '299',
        priceCurrency: 'USD',
        offerCount: '4',
        offers: [
          {
            '@type': 'Offer',
            name: 'Flex',
            price: '0',
            priceCurrency: 'USD',
            description: 'Start without another monthly bill. Unlimited core records and standard quote forms.',
          },
          {
            '@type': 'Offer',
            name: 'Solo',
            price: '35',
            priceCurrency: 'USD',
            description: 'Owner-operator plan with 0.50% platform fee and 2-way customer text messaging.',
          },
          {
            '@type': 'Offer',
            name: 'Growth',
            price: '99',
            priceCurrency: 'USD',
            description: 'Best for growing teams. 5 office users, 10 crew users, and 0.25% platform fee.',
          },
          {
            '@type': 'Offer',
            name: 'Scale',
            price: '299',
            priceCurrency: 'USD',
            description: 'High-volume contractor plan with 0.10% lowest platform fee and 15 office users.',
          },
        ],
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: PRICING_FAQS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    },
  ];

  return (
    <main className={`marketing-shell ${styles.page}`} id="main-content">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <div className={`ambient-glow ${styles.pageGlow}`} aria-hidden="true" />
      <PricingExperience />
      <SiteFooter />
    </main>
  );
}
