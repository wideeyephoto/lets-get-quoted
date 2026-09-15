import type { Metadata } from 'next';
import { cspNonce } from '@/lib/csp-nonce';
import FounderExperience from './FounderExperience';

export const metadata: Metadata = {
  title: 'A note from Brett, founder · Let’s Get Quoted',
  description:
    'I built Let’s Get Quoted for the person doing the work, answering the phone, writing the quotes, and running the business. Start free at $0/mo.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
  openGraph: {
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted for the person doing the work, answering the phone, writing the quotes, and running the business.',
    url: 'https://letsgetquoted.com/founder',
    type: 'profile',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted for the person doing the work, answering the phone, writing the quotes, and running the business.',
  },
};

export default async function FounderPage() {
  const nonce = await cspNonce();
  const founderJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted for the person doing the work, answering the phone, writing the quotes, and running the business.',
    url: 'https://letsgetquoted.com/founder',
    mainEntity: {
      '@type': 'Person',
      name: 'Brett',
      jobTitle: 'Founder',
      worksFor: {
        '@type': 'Organization',
        name: "Let's Get Quoted",
        url: 'https://letsgetquoted.com',
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(founderJsonLd) }}
      />
      <FounderExperience />
    </>
  );
}
