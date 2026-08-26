'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineFeet, feetToMeters } from '@/lib/crew-geofence';
import type { LatLng } from '@/lib/distance';

const BASE_HEARTBEAT_INTERVAL_MS = 45_000;
const MIN_MOVE_METERS = 60;

type UseWorkLocationTrackerOptions = {
  jobId?: string | null;
  isOnShift: boolean;
  isSharingArrival?: boolean;
  canShareLocation?: boolean;
  onPositionUpdate?: (lat: number, lng: number, accuracy: number) => void;
};

export function useWorkLocationTracker({
  jobId,
  isOnShift,
  isSharingArrival = false,
  canShareLocation = true,
  onPositionUpdate,
}: UseWorkLocationTrackerOptions) {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
    capturedAt: string;
  } | null>(null);

  const clientSeqRef = useRef(1);
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const isPushingRef = useRef(false);

  const shouldTrack = canShareLocation && (isOnShift || isSharingArrival);

  // Screen WakeLock for active driving / arrival trips
  useEffect(() => {
    let wakeLockSentinel: unknown = null;
    let isMounted = true;

    if (isSharingArrival && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as unknown as { wakeLock: { request: (type: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock.request('screen')
        .then((lock) => {
          if (isMounted) {
            wakeLockSentinel = lock;
          } else {
            void lock.release();
          }
        })
        .catch(() => {
          // Non-blocking if wake lock unavailable or denied
        });
    }

    return () => {
      isMounted = false;
      if (wakeLockSentinel && typeof (wakeLockSentinel as { release: () => Promise<void> }).release === 'function') {
        void (wakeLockSentinel as { release: () => Promise<void> }).release();
      }
    };
  }, [isSharingArrival]);

  const pushLocation = useCallback(
    async (coords: GeolocationCoordinates, capturedAt: string) => {
      if (isPushingRef.current) return;
      isPushingRef.current = true;
      try {
        const payload = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracyMeters: coords.accuracy || null,
          headingDeg: coords.heading || null,
          speedMps: coords.speed || null,
          capturedAt,
          source: isSharingArrival ? 'arrival' : 'shift',
          clientSequence: clientSeqRef.current++,
          jobId: jobId || null,
        };

        const res = await fetch('/api/field/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok && res.status !== 200) {
          console.warn('Location ingestion response:', res.status);
        }
      } catch {
        // Drop network error silently; next position sample will send when in signal
      } finally {
        isPushingRef.current = false;
      }
    },
    [jobId, isSharingArrival],
  );

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      setError(null);
      const here: LatLng = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const accuracy = position.coords.accuracy || null;
      const capturedAt = new Date(position.timestamp).toISOString();

      setCurrentPosition({
        lat: here.lat,
        lng: here.lng,
        accuracy,
        capturedAt,
      });

      onPositionUpdate?.(here.lat, here.lng, accuracy ?? 0);

      const previous = lastSentRef.current;
      const elapsed = previous ? Date.now() - previous.at : Infinity;
      const movedFeet = previous ? haversineFeet(here, { lat: previous.lat, lng: previous.lng }) : Infinity;
      const movedMeters = previous ? feetToMeters(movedFeet) : Infinity;

      // Adaptive motion-based throttling:
      // In Transit (> 15 mph / 6.7 mps): 20s or 40m
      // Normal: 45s or 60m
      // Stationary (< 3 mph / 1.5 mps): 75s
      const speed = position.coords.speed || 0;
      const targetHeartbeatMs = speed > 6.7 ? 20_000 : speed < 1.5 ? 75_000 : BASE_HEARTBEAT_INTERVAL_MS;
      const targetMinMoveMeters = speed > 6.7 ? 40 : MIN_MOVE_METERS;

      if (elapsed < targetHeartbeatMs && movedMeters < targetMinMoveMeters) {
        return;
      }

      lastSentRef.current = { at: Date.now(), lat: here.lat, lng: here.lng };
      void pushLocation(position.coords, capturedAt);
    },
    [pushLocation, onPositionUpdate],
  );

  useEffect(() => {
    if (!shouldTrack) {
      setIsTracking(false);
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setError('Geolocation not supported on this device');
      setIsTracking(false);
      return;
    }

    let watchId: number | null = null;

    const startWatcher = () => {
      if (watchId !== null) return;
      try {
        watchId = navigator.geolocation.watchPosition(
          handlePosition,
          (err) => {
            setError(err.message || 'Unable to retrieve location');
            setIsTracking(false);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 25_000,
            timeout: 20_000,
          },
        );
        setIsTracking(true);
      } catch {
        setError('Could not start GPS tracking');
        setIsTracking(false);
      }
    };

    const stopWatcher = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      setIsTracking(false);
    };

    // Stop tracking when tab is hidden or minimized
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startWatcher();
      } else {
        stopWatcher();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    if (document.visibilityState === 'visible') {
      startWatcher();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopWatcher();
    };
  }, [shouldTrack, handlePosition]);

  return {
    isTracking,
    currentPosition,
    error,
  };
}
