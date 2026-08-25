'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VoiceCallsLiveRefresher({
  hasActiveCalls,
}: {
  hasActiveCalls: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    // 10s poll if there are active in-progress calls; 30s routine poll otherwise
    const intervalMs = hasActiveCalls ? 10_000 : 30_000;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    }, intervalMs);

    // Refresh immediately when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasActiveCalls, router]);

  return null;
}
