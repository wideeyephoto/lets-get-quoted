'use client';

import { useEffect } from 'react';
import { trackPortalEvent } from '@/lib/analytics';

export function PortalTracker() {
  useEffect(() => {
    trackPortalEvent({ step: 'portal_opened' });
  }, []);

  return null;
}
