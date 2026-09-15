import type { Metadata } from 'next';
import { cspNonce } from '@/lib/csp-nonce';
import LeakageCalculatorClient from './LeakageCalculatorClient';

export const metadata: Metadata = {
  title: 'Free Contractor Profit & Revenue Leakage Calculator | Let’s Get Quoted',
  description:
    'Identify hidden profit leaks draining your contracting business: unbilled scope creep, supply house supply runs, manual check chasing, and delayed deposit float.',
  alternates: { canonical: 'https://letsgetquoted.com/tools/leakage-calculator' },
  openGraph: {
    title: 'Free Contractor Profit & Revenue Leakage Calculator | Let’s Get Quoted',
    description:
      'Identify hidden profit leaks draining your contracting business: unbilled scope creep, supply house supply runs, manual check chasing, and delayed deposit float.',
    url: 'https://letsgetquoted.com/tools/leakage-calculator',
    type: 'website',
    siteName: "Let's Get Quoted",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Contractor Profit & Revenue Leakage Calculator | Let’s Get Quoted',
    description:
      'Identify hidden profit leaks draining your contracting business: unbilled scope creep, supply house supply runs, manual check chasing, and delayed deposit float.',
  },
};

export default async function LeakageCalculatorPage() {
  const nonce = await cspNonce();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Contractor Profit Leakage Calculator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    description:
      'Free interactive diagnostic tool for trade contractors to quantify annual profit leakage from scope creep, supply house runs, check chasing, and cash flow float.',
    url: 'https://letsgetquoted.com/tools/leakage-calculator',
  };

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LeakageCalculatorClient />
    </>
  );
}
