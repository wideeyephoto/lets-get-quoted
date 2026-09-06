'use client';

import { useEffect } from 'react';
import {
  writeStoredNavVisibility,
  type NavVisibilityDecision,
} from '@/lib/nav-visibility-client';

export default function DashboardNavSync({ nav }: { nav: NavVisibilityDecision }) {
  useEffect(() => {
    if (nav) {
      writeStoredNavVisibility(nav);
    }
  }, [nav]);

  return null;
}
