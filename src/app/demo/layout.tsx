import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import DemoBanner from '@/components/demo-banner';

export const metadata: Metadata = {
  title: "Example dashboard | Let's Get Quoted",
  robots: { index: false, follow: false },
};

// Every /demo/** page is 100% static/fictional and requires no auth — see
// src/lib/demo-data.ts for the fixed dataset. Keep this route excluded from
// middleware's /dashboard auth guard (it isn't under /dashboard) and out of
// search results (see metadata.robots above).
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoBanner />
      {children}
    </>
  );
}
