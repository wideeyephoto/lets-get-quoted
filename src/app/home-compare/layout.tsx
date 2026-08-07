import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Homepage — live vs draft',
  robots: { index: false, follow: false },
};

export default function HomeCompareLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
