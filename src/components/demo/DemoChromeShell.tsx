'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import DemoBanner from '@/components/demo-banner';
import DemoSidebar from '@/components/demo-sidebar';
import ThemeFab from '@/components/theme-fab';

export default function DemoChromeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTour = pathname?.startsWith('/demo/tour');

  if (isTour) {
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
