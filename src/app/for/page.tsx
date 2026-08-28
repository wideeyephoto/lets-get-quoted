import type { Metadata } from 'next';
import { TRADES } from '@/lib/trades';
import { FLEX_PRICE } from '@/lib/pricing';
import { titleWithBrand } from '@/lib/seo/marketing-seo';
import SiteFooter from '@/components/site-footer';
import ForExperience from './ForExperience';

export const metadata: Metadata = {
  title: { absolute: titleWithBrand('Contractor Website & Software by Trade') },
  description: `A website, AI Intake, quotes, scheduling, and Stripe payments tailored to your trade. Browse all ${TRADES.length} trades. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
  alternates: { canonical: 'https://letsgetquoted.com/for' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/for',
    siteName: "Let's Get Quoted",
    title: 'Contractor Website & Quoting Software by Trade · Let’s Get Quoted',
    description: `Websites and quoting software built for your trade — ${TRADES.length} of them. Win the lead, quote the job, and get paid. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
    images: [
      {
        url: '/template-previews/professional.jpg',
        width: 1900,
        height: 881,
        alt: 'A contractor website built with Let’s Get Quoted',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Website & Quoting Software by Trade',
    description: `Websites and quoting software built for your trade — ${TRADES.length} of them. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
    images: ['/template-previews/professional.jpg'],
  },
};

export default function TradeIndexPage() {
  const tradeHubJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: "Let's Get Quoted - Contractor Software & Websites by Trade",
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: `Included with Flex plan starting at ${FLEX_PRICE.monthlyPrice}.`,
    },
  };

  return (
    <div id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(tradeHubJsonLd) }}
      />
      <ForExperience />
      <SiteFooter />
    </div>
  );
}
