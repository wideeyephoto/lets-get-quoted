import type { ReactNode } from 'react';

// Minimal presentational wrapper for the mobile field app — no owner chrome
// (AppShell already renders /field bare) and no auth here, so /field/login stays
// reachable. Protected pages guard themselves with requireCrewContext.
export default function FieldLayout({ children }: { children: ReactNode }) {
  return <div className="field-app">{children}</div>;
}
