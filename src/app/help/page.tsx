import type { Metadata } from 'next';
import HelpCenter from '@/components/help-center/HelpCenter';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Help Center & Contractor Support Hub · Let\'s Get Quoted',
  description:
    'Discover guides, instant quoting tutorials, SignalWire 10DLC verification steps, AI troubleshooting, and priority 24/7 support for Let\'s Get Quoted.',
  alternates: { canonical: 'https://letsgetquoted.com/help' },
  openGraph: {
    title: 'Help Center & Support Hub · Let\'s Get Quoted',
    description: 'Instant answers, contractor workflows, and priority support for residential contractors.',
    url: 'https://letsgetquoted.com/help',
    siteName: 'Let\'s Get Quoted',
    type: 'website',
  },
};

export default function HelpPage() {
  return (
    <>
      <HelpCenter />
      <SiteFooter />
    </>
  );
}
