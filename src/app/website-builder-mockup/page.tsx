import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import WebsiteBuilderMockupExperience from './WebsiteBuilderMockupExperience';

export const metadata: Metadata = {
  title: 'AI Website Builder for Contractors (Pricing Theme Mockup) · Let’s Get Quoted',
  description:
    'Launch a complete, editable contractor website with Smart Intake and instant estimates, connected to your back office from day one.',
  alternates: { canonical: 'https://letsgetquoted.com/website-builder-mockup' },
  openGraph: {
    title: 'AI Website Builder for Contractors · Let’s Get Quoted',
    description:
      'Launch a complete, editable contractor website with Smart Intake and instant estimates, connected from day one.',
    url: 'https://letsgetquoted.com/website-builder-mockup',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Website Builder for Contractors · Let’s Get Quoted',
    description: 'Launch a complete, editable contractor website connected from day one.',
  },
};

export default async function WebsiteBuilderMockupPage() {
  const nonce = await cspNonce();

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: "Let's Get Quoted - AI Website Builder",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <WebsiteBuilderMockupExperience />
      <SiteFooter />
    </div>
  );
}
