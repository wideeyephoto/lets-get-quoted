'use client';

import { useEffect, useRef, useState } from 'react';
import { trackPortalEvent, PortalEventPayload } from '@/lib/analytics';

export function InViewTracker({ payload }: { payload: PortalEventPayload }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (tracked || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          trackPortalEvent(payload);
          setTracked(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [tracked, payload]);

  // Make sure it doesn't break layout by having absolute positioning or zero dimensions
  return <div ref={ref} style={{ width: '1px', height: '1px', opacity: 0, position: 'absolute' }} aria-hidden="true" />;
}
