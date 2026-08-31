import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import ForMockupExperience from './ForMockupExperience';

export const metadata: Metadata = {
  title: 'Contractor Software & Websites by Trade (Pricing Theme Mockup) · Let’s Get Quoted',
  description:
    'From an AI contractor website and smart estimator to itemized quotes, crew dispatch, and Stripe payouts—all pre-tuned for 49+ trades. Plans start at $0/month.',
  alternates: { canonical: 'https://letsgetquoted.com/for-mockup' },
  openGraph: {
    title: 'Contractor Software & Websites by Trade · Let’s Get Quoted',
    description:
      'From an AI contractor website and smart estimator to itemized quotes, crew dispatch, and Stripe payouts—pre-tuned from day one for 49+ trades.',
    url: 'https://letsgetquoted.com/for-mockup',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Software & Websites by Trade · Let’s Get Quoted',
    description: 'Preconfigured software and websites for 49+ trades. Flex is $0/month.',
  },
};

export default async function ForMockupPage() {
  const nonce = await cspNonce();

  const tradeHubJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: "Let's Get Quoted - Contractor Software by Trade",
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Included with Flex plan starting at $0/month.',
    },
  };

  return (
    <div id="main-content">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(tradeHubJsonLd) }}
      />
      <ForMockupExperience />
      <SiteFooter />
    </div>
  );
}
