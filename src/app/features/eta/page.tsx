import type { Metadata } from 'next';
import LiveEtaFeaturePage from '../live-eta/page';

export const metadata: Metadata = {
  title: 'Live Technician ETA Sharing and Expiring Map Links',
  description:
    'Give customers an expiring live map link, an updated arrival window, and automatic delay notices without tracking crew all day.',
  alternates: { canonical: 'https://letsgetquoted.com/features/live-eta' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/live-eta',
    siteName: "Let's Get Quoted",
    title: 'Your customer stops wondering where you are.',
    description:
      'Live technician tracking link with automated arrival windows and privacy protections for field service contractors.',
    images: [{ url: '/features/og-live-eta.jpg', width: 1200, height: 630, alt: 'Live technician ETA sharing for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your customer stops wondering where you are.',
    description:
      'Live technician tracking link with automated arrival windows and privacy protections for field service contractors.',
    images: ['/features/og-live-eta.jpg'],
  },
};

export default function EtaFeaturePage() {
  return <LiveEtaFeaturePage />;
}
