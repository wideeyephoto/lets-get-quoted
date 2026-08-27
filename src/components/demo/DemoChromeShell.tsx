'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import DemoBanner from '@/components/demo-banner';
import DemoSidebar from '@/components/demo-sidebar';
import ThemeFab from '@/components/theme-fab';

export default function DemoChromeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTour = pathname?.startsWith('/demo/tour');
  const isStandaloneSimulator = pathname?.startsWith('/demo/sms-quote');

  // These two experiences own their own chrome. The lifecycle tour simulates
  // both sides of a job, while the SMS quote route is a self-contained
  // marketing simulator with SiteHeader/SiteFooter. Wrapping either in the
  // dashboard rail produces two navigation systems in the same frame.
  if (isTour || isStandaloneSimulator) {
    return <div className="demo-tour-shell">{children}</div>;
  }

  return (
    <div className="chrome-shell chrome-shell-sidenav">
      <DemoSidebar />
      <div className="app-main app-main-sidenav">
        <DemoBanner />
        {children}
      </div>
      <ThemeFab />
    </div>
  );
}
