import type { Metadata } from 'next';
import { cspNonce } from '@/lib/csp-nonce';
import HourlyRateCalculatorClient from './HourlyRateCalculatorClient';

export const metadata: Metadata = {
  title: 'Free Contractor Hourly Rate & Profit Margin Calculator | Let’s Get Quoted',
  description:
    'Calculate your true billable hourly rate, breakeven cost, and target profit margin. Account for unbillable drive time, overhead, and crew payroll tax burden.',
  alternates: { canonical: 'https://letsgetquoted.com/tools/hourly-rate-calculator' },
  openGraph: {
    title: 'Free Contractor Hourly Rate & Profit Margin Calculator | Let’s Get Quoted',
    description:
      'Calculate your true billable hourly rate, breakeven cost, and target profit margin. Account for unbillable drive time, overhead, and crew payroll tax burden.',
    url: 'https://letsgetquoted.com/tools/hourly-rate-calculator',
    type: 'website',
    siteName: "Let's Get Quoted",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Contractor Hourly Rate & Profit Margin Calculator | Let’s Get Quoted',
    description:
      'Calculate your true billable hourly rate, breakeven cost, and target profit margin. Account for unbillable drive time, overhead, and crew payroll tax burden.',
  },
};

export default async function HourlyRateCalculatorPage() {
  const nonce = await cspNonce();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Contractor True Hourly Rate Calculator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    description:
      'Free interactive tool for trade contractors to calculate true billable hourly rates, breakeven costs, and target profit margins.',
    url: 'https://letsgetquoted.com/tools/hourly-rate-calculator',
  };

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HourlyRateCalculatorClient />
    </>
  );
}
