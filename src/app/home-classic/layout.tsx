import type { ReactNode } from 'react';
import type { Metadata } from 'next';

/**
 * The homepage this site ran until the flagship tour replaced it.
 *
 * Kept, and kept working, for two reasons. Rolling back is then a one-line
 * change rather than a revert of a large commit — and the two can still be put
 * side by side, which is the only honest way to tell whether the new one is
 * actually better once it has real traffic behind it.
 *
 * Noindexed: there is one homepage as far as search is concerned, and a second
 * copy of the same claims on the same domain competes with the first.
 */
export const metadata: Metadata = {
  title: 'Previous homepage',
  robots: { index: false, follow: false },
  alternates: { canonical: '/' },
};

export default function HomeClassicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
