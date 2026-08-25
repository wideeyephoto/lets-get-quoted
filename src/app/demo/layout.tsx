/**
 * The full stylesheet, on top of the lite one the root layout already
 * loaded. This tree renders the product's own UI, which is exactly the
 * ~590KB of rules the lite sheet drops.
 *
 * Loading both is deliberate. globals.css contains every rule in
 * globals-lite.css, in the same order, and comes after it — so the last
 * matching declaration for any element is always the one from this file,
 * and the cascade here is identical to what it was when the root layout
 * imported globals.css for everybody. Importing only the DIFFERENCE would
 * be smaller and wrong: it would put rules like .priority-panel after the
 * generic .workspace-section-card that is meant to override them.
 */
import '../globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import DemoChromeShell from '@/components/demo/DemoChromeShell';

export const metadata: Metadata = {
  title: 'Example dashboard',
  robots: { index: false, follow: false },
};

// Every /demo/** page is 100% static/fictional and requires no auth — see
// src/lib/demo-data.ts for the fixed dataset. The demo owns its chrome: AppShell
// steps aside for /demo (see app-shell.tsx), and DemoChromeShell renders the
// appropriate chrome (full tour layout for /demo/tour, dashboard rail for /demo).
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoChromeShell>{children}</DemoChromeShell>;
}
