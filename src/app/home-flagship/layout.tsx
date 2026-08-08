import type { ReactNode } from 'react';
import type { Metadata } from 'next';

/**
 * The route redirects to '/' now that this candidate is the homepage.
 *
 * The layout survives only to keep the redirect out of the index — a 307 to a
 * canonical page is handled correctly by crawlers on its own, but there is no
 * reason for this address to be a candidate for anything.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export default function HomeFlagshipLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
