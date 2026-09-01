import type { Metadata } from 'next';
import { TRADES } from '@/lib/trades';
import { FLEX_PRICE } from '@/lib/pricing';
import { titleWithBrand } from '@/lib/seo/marketing-seo';
import SiteFooter from '@/components/site-footer';
import ForExperience from './ForExperience';

export const metadata: Metadata = {
  title: { absolute: titleWithBrand('Contractor Websites, Estimators & Quotes by Trade') },
  description: `Choose from ${TRADES.length}+ trades and start with editable services, smart intake questions, an instant estimator, and highly customizable Smart Quotes. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
  alternates: { canonical: 'https://letsgetquoted.com/for' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/for',
    siteName: "Let's Get Quoted",
    title: 'Contractor Websites, Estimators & Quotes by Trade · Let’s Get Quoted',
    description: `Choose your trade and start with editable services, smart intake, an instant estimator, and highly customizable Smart Quotes. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
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
    title: 'Contractor Websites, Estimators & Quotes by Trade',
    description: `Choose from ${TRADES.length}+ trade starting points with editable services, smart intake, estimators, and Smart Quotes. Plans start at ${FLEX_PRICE.monthlyPrice}.`,
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
