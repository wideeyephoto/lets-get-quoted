'use client';

import { useState } from 'react';
import {
  verifyGeofenceClockIn,
  type GeofenceVerificationResult,
} from '@/lib/crew-geofence';
import type { LatLng } from '@/lib/distance';

type Props = {
  jobId: string;
  jobLabel: string;
  jobSiteCoord?: LatLng | null;
  isClockedIn: boolean;
  onClockToggle: (params: {
    isClockIn: boolean;
    lat: number | null;
    lng: number | null;
    accuracyMeters: number | null;
    geofenceResult: GeofenceVerificationResult | null;
  }) => Promise<void>;
};

export default function GeofencedClockButton({
  jobId: _jobId,
  jobLabel,
  jobSiteCoord,
  isClockedIn,
  onClockToggle,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<GeofenceVerificationResult | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  async function handleAction() {
    setLoading(true);
    setGpsError(null);

    let lat: number | null = null;
    let lng: number | null = null;
    let accuracyMeters: number | null = null;
    let geofenceResult: GeofenceVerificationResult | null = null;

    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 10000,
          });
        });

        lat = position.coords.latitude;
        lng = position.coords.longitude;
        accuracyMeters = position.coords.accuracy;

        if (jobSiteCoord) {
          geofenceResult = verifyGeofenceClockIn({
            technicianCoord: { lat, lng },
            jobSiteCoord,
            accuracyMeters,
          });
          setLastResult(geofenceResult);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'GPS location unavailable';
        setGpsError(message);
      }
    }

    try {
      await onClockToggle({
        isClockIn: !isClockedIn,
        lat,
        lng,
        accuracyMeters,
        geofenceResult,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '6px' }}>
      <button
        type="button"
        onClick={handleAction}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.88rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          background: isClockedIn ? '#ef4444' : '#047857',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          transition: 'background 0.2s',
        }}
      >
        <span aria-hidden="true">{isClockedIn ? '⏱️' : '📍'}</span>
        <span>
          {loading
            ? 'Acquiring GPS...'
            : isClockedIn
              ? 'Clock Out'
              : `Clock In • ${jobLabel}`}
        </span>
      </button>

      {/* Geofence Status Pill */}
      {lastResult ? (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '10px',
            background:
              lastResult.badgeTone === 'success'
                ? '#dcfce7'
                : lastResult.badgeTone === 'warn'
                  ? '#fef3c7'
                  : '#f1f5f9',
            color:
              lastResult.badgeTone === 'success'
                ? '#15803d'
                : lastResult.badgeTone === 'warn'
                  ? '#b45309'
                  : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {lastResult.badgeLabel}
        </span>
      ) : gpsError ? (
        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
          GPS permission skipped • Clocked manually
        </span>
      ) : null}
    </div>
  );
}
