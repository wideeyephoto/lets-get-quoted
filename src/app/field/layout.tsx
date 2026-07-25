import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

// Marks the field app as an installable PWA (its own manifest + iOS web-app
// meta), scoped to /field. The crew installs it to their home screen and it
// launches standalone into their jobs.
export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Field', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#06131f',
};

// Minimal presentational wrapper for the mobile field app — no owner chrome
// (AppShell already renders /field bare) and no auth here, so /field/login stays
// reachable. Protected pages guard themselves with requireCrewContext.
export default function FieldLayout({ children }: { children: ReactNode }) {
  return <div className="field-app">{children}</div>;
}
