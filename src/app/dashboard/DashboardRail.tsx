import { resolveVisibleNav, type NavSignals } from '@/lib/nav-visibility';
import type { NavVisibilityDecision } from '@/lib/nav-visibility-client';
import DashboardNavSync from './DashboardNavSync';

export { DashboardNavSync };

export type DashboardRailProps = {
  signals?: NavSignals;
  nav?: NavVisibilityDecision;
};

/**
 * DashboardRail wraps server-side navigation persona resolution and client sync.
 */
export default function DashboardRail({ signals, nav }: DashboardRailProps) {
  const resolvedNav: NavVisibilityDecision =
    nav ?? (signals ? resolveVisibleNav(signals) : { visible: [], demoted: [], hiddenCount: 0 });

  return <DashboardNavSync nav={resolvedNav} />;
}
