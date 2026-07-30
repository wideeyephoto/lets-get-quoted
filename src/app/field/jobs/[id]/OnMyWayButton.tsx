'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { onMyWayFieldAction } from './actions';

// Tech taps "I'm on my way" — grabs their location (best-effort, for the ETA)
// and fires the action, which texts the customer a live tracking link. Falls
// through and still sends the link (no ETA) if location is denied/unavailable.
export default function OnMyWayButton({ jobId, alreadyEnRoute }: { jobId: string; alreadyEnRoute: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const fd = new FormData();
    await new Promise<void>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fd.set('lat', String(pos.coords.latitude));
          fd.set('lng', String(pos.coords.longitude));
          resolve();
        },
        () => resolve(),
        { timeout: 8000, enableHighAccuracy: true },
      );
    });
    try {
      await onMyWayFieldAction(jobId, fd);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn primary" onClick={go} disabled={busy}>
      {busy ? 'Notifying…' : alreadyEnRoute ? 'Resend "on my way" link' : "📍 I'm on my way"}
    </button>
  );
}
