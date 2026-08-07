import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Homepage candidate — flagship tour',
  // Noindexed for the same reason /home-next is: there can only be one
  // homepage as far as search is concerned, and candidates making the same
  // claims on the same domain compete with each other. Shipped rather than
  // screenshotted because a homepage has to be opened on a real phone, over a
  // real connection, from a link you can send to somebody.
  robots: { index: false, follow: false },
};

export default function HomeFlagshipLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
