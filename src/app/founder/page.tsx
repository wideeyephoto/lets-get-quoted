import type { Metadata } from 'next';
import { cspNonce } from '@/lib/csp-nonce';
import FounderExperience from './FounderExperience';

export const metadata: Metadata = {
  title: 'A note from Brett, founder · Let’s Get Quoted',
  description:
    'Why I built Let’s Get Quoted: so a one-truck business can look—and run—like a much bigger company. Start at $0/month with Flex or choose a paid plan as you grow.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
  openGraph: {
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted so a one-truck business can look—and run—like a much bigger company.',
    url: 'https://letsgetquoted.com/founder',
    type: 'profile',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted so a one-truck business can look—and run—like a much bigger company.',
  },
};

export default function FounderPage() {
  const nonce = cspNonce();
  const founderJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'Why I built Let’s Get Quoted so a one-truck business can look and run like a much bigger company.',
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
