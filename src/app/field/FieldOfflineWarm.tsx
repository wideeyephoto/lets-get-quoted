'use client';

import { useEffect, useState } from 'react';

// The half of offline support that has to live in the page.
//
// TWO JOBS, both of which the service worker cannot do alone:
//
//   1. WARMING. The pages a crew member needs offline are the ones they haven't
//      opened yet — stop three's scope, read on the drive to stop two. Only the
//      page knows which those are (it just rendered today's route), so it hands
//      the list over while there is still signal.
//
//   2. NUDGING. A service worker cannot listen for 'online'. Background Sync
//      covers Chrome and nothing else, so on every other browser the queue
//      would sit there until the next fetch happened to trigger it. The window
//      hears the reconnect and tells the worker to drain.
//
// It renders a line only when there is something pending. Silence is the
// correct output for "everything sent", and a permanent "you are online" badge
// is a badge nobody reads by day two.

export default function FieldOfflineWarm({ urls }: { urls: string[] }) {
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; pending?: number } | null;
      if (!data) return;
      if (data.type === 'field-queue-changed') setPending(Number(data.pending) || 0);
      if (data.type === 'field-queue-rejected') setRejected(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled || !registration.active) return;
        registration.active.postMessage({ type: 'field-queue-count' });
        // Warming competes with the page the crew member is actually reading,
        // so it waits for the load to settle rather than fighting it.
        const warm = () => registration.active?.postMessage({ type: 'field-warm', urls });
        if (document.readyState === 'complete') setTimeout(warm, 1200);
        else window.addEventListener('load', () => setTimeout(warm, 1200), { once: true });
      })
      .catch(() => {});

    const drain = () => {
      navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'field-drain' })).catch(() => {});
    };
    window.addEventListener('online', drain);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('online', drain);
    };
    // urls is rebuilt every render by the server component above; joining it
    // keeps this to one warm per actual change of route rather than one per
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('|')]);

  if (rejected) {
    return (
      <p className="field-flash is-error" role="status">
        Something you saved offline was refused when it sent. Check your hours and materials on the job.
      </p>
    );
  }

  if (pending > 0) {
    return (
      <p className="field-queue-note" role="status">
        📡 {pending} {pending === 1 ? 'entry is' : 'entries are'} waiting to send. They&apos;ll go on their own when
        you&apos;re back in signal.
      </p>
    );
  }

  return null;
}
