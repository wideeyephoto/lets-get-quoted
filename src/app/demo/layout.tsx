import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import DemoBanner from '@/components/demo-banner';
import DemoSidebar from '@/components/demo-sidebar';

export const metadata: Metadata = {
  title: 'Example dashboard',
  robots: { index: false, follow: false },
};

// Every /demo/** page is 100% static/fictional and requires no auth — see
// src/lib/demo-data.ts for the fixed dataset. The demo owns its chrome: AppShell
// steps aside for /demo (see app-shell.tsx), and we render the same left rail
// the real dashboard uses so prospects see the current product. Route stays out
// of middleware's /dashboard auth guard and out of search results (robots above).
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="chrome-shell chrome-shell-sidenav">
      <DemoSidebar />
      <div className="app-main app-main-sidenav">
        <DemoBanner />
        {children}
      </div>
    </div>
  );
}
