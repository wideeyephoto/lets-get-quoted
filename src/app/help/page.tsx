import React from 'react';
import type { Metadata } from 'next';
import HelpCenter from '@/components/help-center/HelpCenter';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Help Center & Troubleshooting',
  description:
    'Find instant answers and diagnostic troubleshooting guides for sending quotes, Stripe Connect payouts, custom DNS domains, dedicated 10DLC SMS setup, and crew dispatching.',
  alternates: {
    canonical: 'https://letsgetquoted.com/help'
  },
  openGraph: {
    title: 'Help Center & Troubleshooting',
    description:
      'Search our interactive troubleshooter and browse step-by-step guides for residential trade contractors.',
    url: 'https://letsgetquoted.com/help',
    siteName: 'Let’s Get Quoted',
    type: 'website',
    images: [
      {
        url: '/template-previews/professional.jpg',
        width: 1900,
        height: 881,
        alt: 'Let’s Get Quoted Help Center & Troubleshooting'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help Center & Troubleshooting',
    description:
      'Search our interactive troubleshooter and browse step-by-step guides for residential trade contractors.',
    images: ['/template-previews/professional.jpg']
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
