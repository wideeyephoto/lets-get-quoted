'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

function playNewCallChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio autoplay policy fallback
  }
}

export default function VoiceCallsLiveRefresher({
  hasActiveCalls,
}: {
  hasActiveCalls: boolean;
}) {
  const router = useRouter();
  const lastPolledRef = useRef<string>(new Date().toISOString());
  const hasActiveCallsRef = useRef(hasActiveCalls);
  hasActiveCallsRef.current = hasActiveCalls;

  useEffect(() => {
    // Request notification permission if not yet requested
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    async function pollStatus() {
      if (document.visibilityState !== 'visible') return;

      try {
        const since = lastPolledRef.current;
        const res = await fetch(`/api/voice/poll?since=${encodeURIComponent(since)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;

        const data = await res.json();
        lastPolledRef.current = data.polledAt || new Date().toISOString();

        if (data.newCallsCount > 0 || data.hasActiveCalls !== hasActiveCallsRef.current) {
          if (data.newCallsCount > 0) {
            playNewCallChime();
            document.title = `(${data.newCallsCount}) AI Voice Assistant | New Call`;

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('New AI Voice Call', {
                body: `${data.newCallsCount} new call received by your receptionist.`,
              });
            }
          }

          router.refresh();
        }
      } catch {
        // quiet fallback
      }
    }

    // 10s poll if there are active in-progress calls; 25s routine poll otherwise
    const intervalMs = hasActiveCalls ? 10_000 : 25_000;
    const interval = setInterval(pollStatus, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollStatus();
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
