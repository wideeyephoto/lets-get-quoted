import type { Metadata } from 'next';
import { cspNonce } from '@/lib/csp-nonce';
import FounderExperience from './FounderExperience';

export const metadata: Metadata = {
  title: 'A note from Brett, founder · Let’s Get Quoted',
  description:
    'Why I built Let’s Get Quoted: so great craftsmanship doesn’t lose jobs to mediocre competitors. Run a 1-truck business with cleaner intake, faster quotes, and $0/mo pricing.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
  openGraph: {
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'Great craftsmanship shouldn’t lose jobs to mediocre competitors. I built Let’s Get Quoted so a 1-truck contracting business can look and run like a much bigger company.',
    url: 'https://letsgetquoted.com/founder',
    type: 'profile',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'Great craftsmanship shouldn’t lose jobs to mediocre competitors. I built Let’s Get Quoted so a 1-truck contracting business can look and run like a much bigger company.',
  },
};

export default async function FounderPage() {
  const nonce = await cspNonce();
  const founderJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'Why I built Let’s Get Quoted so a one-truck business can look and run like a much bigger company with cleaner intake and faster quotes.',
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
