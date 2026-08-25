import { Metadata } from 'next';
import HelpCenter from '@/components/help-center/HelpCenter';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Help Center & Contractor Playbooks | Let\'s Get Quoted',
  description:
    'Discover guides, instant quoting tutorials, 10DLC verification steps, AI troubleshooting, and priority 24/7 support for Let\'s Get Quoted.',
  alternates: {
    canonical: 'https://letsgetquoted.com/help'
  },
  openGraph: {
    title: 'Help Center & Support Command Hub | Let\'s Get Quoted',
    description: 'Instant answers, contractor playbooks, AI diagnostics, and priority engineering support.',
    url: 'https://letsgetquoted.com/help',
    siteName: 'Let\'s Get Quoted'
  }
};

export default function HelpPage() {
  return (
    <main>
      <HelpCenter />
      <SiteFooter />
    </main>
  );
}
