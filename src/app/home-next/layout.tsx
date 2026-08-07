import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Homepage draft — Let’s Get Quoted',
  // Shipped to production on purpose, and kept out of search on purpose.
  //
  // Shipped, because a homepage cannot be judged from a screenshot: it has to
  // be opened on a real phone, over a real connection, from a link you can send
  // to somebody. Noindexed, because as far as Google is concerned there must
  // only ever be one homepage — two pages making the same claims on the same
  // domain compete with each other. /demo already ships under exactly this
  // arrangement.
  robots: { index: false, follow: false },
};

export default function HomeNextLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
