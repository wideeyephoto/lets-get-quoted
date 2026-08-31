import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import PricingExperience from './PricingExperience';
import { PRICING_FAQS } from './pricing-catalog';

export const metadata: Metadata = {
  title: 'Contractor Software Pricing',
  description:
    'From an AI-powered website and instant quoting to client texting, booking, invoices, payments, and QuickBooks sync—everything connected from day one.',
  alternates: { canonical: 'https://letsgetquoted.com/pricing' },
  openGraph: {
    title: 'Contractor Software Pricing · Let’s Get Quoted',
    description:
      'Your whole contracting business from $0/month—website, quoting, booking, texting, invoices, payments, and QuickBooks sync connected from day one.',
    url: 'https://letsgetquoted.com/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Software Pricing · Let’s Get Quoted',
    description: 'Your whole contracting business from $0/month, connected from day one.',
  },
};

export default async function PricingPage() {
  const nonce = await cspNonce();
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
        highPrice: '329',
        priceCurrency: 'USD',
        offerCount: '7',
        offers: [
          {
            '@type': 'Offer',
            name: 'Flex',
            price: '0',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '0',
              priceCurrency: 'USD',
              unitText: 'month',
            },
            description: 'Start without another monthly bill. 1.25% platform fee, unlimited core records, and custom-domain contractor website.',
          },
          {
            '@type': 'Offer',
            name: 'Solo (Monthly)',
            price: '39',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '39',
              priceCurrency: 'USD',
              unitText: 'month',
            },
            description: 'Owner-operator plan with 0.50% platform fee, 2 office users, and 500 text credits/month.',
          },
          {
            '@type': 'Offer',
            name: 'Solo (Annual)',
            price: '420',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '420',
              priceCurrency: 'USD',
              unitText: 'year',
              referenceQuantity: {
                '@type': 'QuantitativeValue',
                value: '1',
                unitCode: 'ANN',
              },
            },
            description: 'Owner-operator annual plan ($35/mo equivalent, save $48/yr) with 0.50% platform fee and 2 office users.',
          },
          {
            '@type': 'Offer',
            name: 'Growth (Monthly)',
            price: '129',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '129',
              priceCurrency: 'USD',
              unitText: 'month',
            },
            description: 'Best for growing teams. 5 office users, 10 crew users, 0.25% platform fee, and 1,500 text credits/month.',
          },
          {
            '@type': 'Offer',
            name: 'Growth (Annual)',
            price: '1188',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '1188',
              priceCurrency: 'USD',
              unitText: 'year',
              referenceQuantity: {
                '@type': 'QuantitativeValue',
                value: '1',
                unitCode: 'ANN',
              },
            },
            description: 'Growing team annual plan ($99/mo equivalent, save $360/yr) with 5 office users and 0.25% platform fee.',
          },
          {
            '@type': 'Offer',
            name: 'Scale (Monthly)',
            price: '329',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '329',
              priceCurrency: 'USD',
              unitText: 'month',
            },
            description: 'High-volume contractor plan with 0.10% lowest platform fee, 15 office users, and 3,000 text credits/month.',
          },
          {
            '@type': 'Offer',
            name: 'Scale (Annual)',
            price: '3588',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: '3588',
              priceCurrency: 'USD',
              unitText: 'year',
              referenceQuantity: {
                '@type': 'QuantitativeValue',
                value: '1',
                unitCode: 'ANN',
              },
            },
            description: 'High-volume contractor annual plan ($299/mo equivalent, save $360/yr) with 0.10% platform fee and 15 office users.',
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
    <main id="main-content">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <PricingExperience />
      <SiteFooter />
    </main>
  );
}
