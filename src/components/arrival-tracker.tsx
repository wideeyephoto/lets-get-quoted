'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { metersBetween, withinArrivalGeofence, ARRIVAL_GEOFENCE_METERS } from '@/lib/arrival';

// Keeps the customer's pin moving while the tech is driving, and offers to mark
// arrived when they get there.
//
// Three deliberate limits, because this is the part of the feature that could
// quietly become surveillance or a battery complaint:
//
//   1. It only runs while this page is OPEN and visible. There is no service
//      worker, no background geolocation, no wake lock. Close the tab and the
//      pin stops moving.
//   2. It only runs on a trip the tech already consented to share.
//   3. It never announces arrival by itself. Crossing the geofence ASKS. A
//      system that tells a customer "he's arrived" while the tech is still
//      finding a parking space has spent trust it can't earn back.

const PUSH_INTERVAL_MS = 45_000;
const MIN_MOVE_METERS = 60;

type Props = {
  jobId: string;
  dest: { lat: number; lng: number } | null;
  /** Whether this trip is sharing location — false means pin updates are off. */
  sharing: boolean;
  updatePosition: (lat: number, lng: number) => Promise<void>;
  /** Rendered inside the prompt, so "Mark arrived" is the real status form. */
  arrivedForm: React.ReactNode;
};

export default function ArrivalTracker({ jobId, dest, sharing, updatePosition, arrivedForm }: Props) {
  const [nearby, setNearby] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const lastSent = useRef<{ at: number; lat: number; lng: number } | null>(null);

  const onPosition = useCallback((position: GeolocationPosition) => {
    const here = { lat: position.coords.latitude, lng: position.coords.longitude };

    if (dest) {
      const away = metersBetween(here, dest);
      setDistance(away);
      setNearby(withinArrivalGeofence(here, dest));
    }

    if (!sharing) return;
    // Throttle on BOTH time and movement: a phone sitting at a red light
    // shouldn't spend a round trip every 45 seconds saying nothing changed.
    const previous = lastSent.current;
    const elapsed = previous ? Date.now() - previous.at : Infinity;
    const moved = previous ? metersBetween(here, previous) : Infinity;
    if (elapsed < PUSH_INTERVAL_MS || moved < MIN_MOVE_METERS) return;

    lastSent.current = { at: Date.now(), ...here };
    // Fire and forget: a dropped position update is the next one's problem, and
    // surfacing it would be noise on a screen that's being driven past.
    void updatePosition(here.lat, here.lng).catch(() => {});
  }, [dest, sharing, updatePosition]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(onPosition, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 20_000,
      });
    };
    const stop = () => {
      if (watchId === null) return;
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    // Backgrounding the app stops the watch outright. This is the difference
    // between "shares while you're using it" and "tracks you", and it is the
    // whole reason this component is safe to ship.
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [onPosition, jobId]);

  if (!nearby || dismissed) return null;

  return (
    <div className="arrival-geofence" role="status">
      <div className="arrival-geofence-copy">
        <strong>Looks like you&rsquo;re here</strong>
        <span>
          You&rsquo;re within {Math.round(distance ?? ARRIVAL_GEOFENCE_METERS)}m of the address. Marking arrived
          updates the customer&rsquo;s page and stops sharing your location.
        </span>
      </div>
      <div className="arrival-geofence-actions">
        {arrivedForm}
        <button type="button" className="arrival-link-btn" onClick={() => setDismissed(true)}>Not yet</button>
      </div>
    </div>
  );
}
