import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import PricingExperience from './PricingExperience';
import { PRICING_FAQS } from './pricing-catalog';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Contractor Software Pricing',
  description:
    'Flexible contractor software pricing from $0/month. Compare Flex, Solo, Growth, and Scale, calculate your LGQ platform fee, and add AI Voice Receptionist when you need it.',
  alternates: { canonical: 'https://letsgetquoted.com/pricing' },
  openGraph: {
    title: 'Contractor Software Pricing · Let’s Get Quoted',
    description:
      'Start at $0/month, add your own business number, and reach a 0.1% LGQ platform fee as your contracting business grows.',
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
  const faqJsonLd = {
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
  };

  return (
    <main className={`marketing-shell ${styles.page}`} id="main-content">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className={`ambient-glow ${styles.pageGlow}`} aria-hidden="true" />
      <PricingExperience />
      <SiteFooter />
    </main>
  );
}
