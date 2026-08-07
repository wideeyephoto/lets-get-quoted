import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Homepage candidate — editorial',
  // Noindexed like every other candidate: there can only be one homepage as
  // far as search is concerned, and pages making the same claims on the same
  // domain compete with each other.
  robots: { index: false, follow: false },
};

export default function HomeEditorialLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
