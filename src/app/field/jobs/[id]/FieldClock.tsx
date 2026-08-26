'use client';

import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import SaveButton from '@/components/save-button';
import { looksOffline, payloadFor, queueFieldSubmission } from '@/lib/field-offline-client';
import { verifyGeofenceClockIn, type GeofenceVerificationResult } from '@/lib/crew-geofence';
import { useWorkLocationTracker } from '@/hooks/use-work-location-tracker';
import type { LatLng } from '@/lib/distance';

function elapsedFrom(startedAt: string): string {
  const totalMinutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export default function FieldClock({
  jobId,
  clockIn,
  clockOut,
  startedAt,
  startedLabel,
  elapsedLabel,
  busyElsewhere,
  required,
  jobSiteCoord,
  canShareLocation = true,
}: {
  jobId: string;
  clockIn: (formData: FormData) => Promise<void>;
  clockOut: (formData: FormData) => Promise<void>;
  startedAt: string | null;
  startedLabel: string | null;
  elapsedLabel: string | null;
  /** They're clocked in on a different job — one shift at a time. */
  busyElsewhere: boolean;
  required: boolean;
  jobSiteCoord?: LatLng | null;
  canShareLocation?: boolean;
}) {
  // Server-rendered first so the number is right before hydration, then ticked.
  const [elapsed, setElapsed] = useState(elapsedLabel ?? '');
  // Held on the phone because there was no signal at the moment of the tap.
  const [held, setHeld] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [geofenceResult, setGeofenceResult] = useState<GeofenceVerificationResult | null>(null);
  const [acquiringGps, setAcquiringGps] = useState(false);

  const clockInFormRef = useRef<HTMLFormElement | null>(null);
  const clockOutFormRef = useRef<HTMLFormElement | null>(null);

  // Background/Foreground GPS tracker while on the clock
  const { isTracking } = useWorkLocationTracker({
    jobId,
    isOnShift: Boolean(startedAt),
    canShareLocation,
  });

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(elapsedFrom(startedAt));
    const timer = setInterval(() => setElapsed(elapsedFrom(startedAt)), 30_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const acquireLocation = useCallback(async (): Promise<{
    lat?: number;
    lng?: number;
    accuracy?: number;
    gpsUnavailable?: boolean;
  }> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      return { gpsUnavailable: true };
    }
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => resolve({ gpsUnavailable: true }), 3500);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(timeoutId);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => {
          window.clearTimeout(timeoutId);
          resolve({ gpsUnavailable: true });
        },
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 15000 },
      );
    });
  }, []);

  const offlineSubmit = useCallback(
    (kind: 'clock-in' | 'clock-out', message: string) => (event: FormEvent<HTMLFormElement>) => {
      if (!looksOffline()) return;
      event.preventDefault();
      const form = event.currentTarget;
      setProblem(null);
      void queueFieldSubmission(kind, jobId, payloadFor(kind, form)).then((outcome) => {
        if (outcome.state === 'failed') {
          setProblem(outcome.message);
          return;
        }
        setHeld(outcome.state === 'queued' ? message : 'Saved ✓');
        form.reset();
      });
    },
    [jobId],
  );

  const handleClockInSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (looksOffline()) return; // Handled by offlineSubmit
    e.preventDefault();
    setAcquiringGps(true);
    setProblem(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const loc = await acquireLocation();
      if (loc.lat != null && loc.lng != null) {
        formData.set('lat', String(loc.lat));
        formData.set('lng', String(loc.lng));
        if (loc.accuracy != null) formData.set('accuracy', String(loc.accuracy));

        if (jobSiteCoord) {
          const verification = verifyGeofenceClockIn({
            technicianCoord: { lat: loc.lat, lng: loc.lng },
            jobSiteCoord,
            accuracyMeters: loc.accuracy,
          });
          setGeofenceResult(verification);
          formData.set('geofenceStatus', verification.status);
          if (verification.distanceFeet != null) {
            formData.set('distanceFt', String(verification.distanceFeet));
          }
        }
      } else {
        formData.set('gpsUnavailable', 'true');
      }

      await clockIn(formData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not clock in.';
      setProblem(msg);
    } finally {
      setAcquiringGps(false);
    }
  };

  const handleClockOutSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (looksOffline()) return;
    e.preventDefault();
    setAcquiringGps(true);
    setProblem(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const loc = await acquireLocation();
      if (loc.lat != null && loc.lng != null) {
        formData.set('lat', String(loc.lat));
        formData.set('lng', String(loc.lng));
        if (loc.accuracy != null) formData.set('accuracy', String(loc.accuracy));

        if (jobSiteCoord) {
          const verification = verifyGeofenceClockIn({
            technicianCoord: { lat: loc.lat, lng: loc.lng },
            jobSiteCoord,
            accuracyMeters: loc.accuracy,
          });
          formData.set('geofenceStatus', verification.status);
          if (verification.distanceFeet != null) {
            formData.set('distanceFt', String(verification.distanceFeet));
          }
        }
      }

      await clockOut(formData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not clock out.';
      setProblem(msg);
    } finally {
      setAcquiringGps(false);
    }
  };

  const notes = (
    <>
      {held ? (
        <p className="field-queue-note" role="status">{held}</p>
      ) : null}
      {problem ? (
        <p className="field-flash is-error" role="status">{problem}</p>
      ) : null}
    </>
  );

  if (startedAt) {
    return (
      <div className="field-clock is-running">
        <div className="field-clock-state">
          <span className="field-clock-dot" aria-hidden="true" />
          <div>
            <strong>On the clock</strong>
            <span>Since {startedLabel} · {elapsed}</span>
          </div>
        </div>

        {/* Foreground Live Tracking Indicator */}
        {isTracking ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#047857', background: '#dcfce7', padding: '4px 10px', borderRadius: '6px', margin: '4px 0 10px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            <span>Work location sharing active while this app is open</span>
          </div>
        ) : null}

        <form
          ref={clockOutFormRef}
          action={clockOut}
          onSubmit={looksOffline() ? offlineSubmit('clock-out', 'Clocked out at this time — held on your phone until you’re back in signal ✓') : handleClockOutSubmit}
          className="field-clock-form"
        >
          <input name="description" type="text" placeholder="What you worked on (optional)" />
          <SaveButton
            className="btn primary"
            pendingLabel={acquiringGps ? 'Checking GPS & clocking out…' : 'Clocking out…'}
            savedLabel="Clocked out ✓"
            disabled={acquiringGps}
          >
            Clock out
          </SaveButton>
        </form>
        {notes}
      </div>
    );
  }

  return (
    <div className="field-clock">
      <div className="field-clock-state">
        <div>
          <strong>Not clocked in</strong>
          <span>
            {busyElsewhere
              ? "You're on the clock on another job — clock out of that one first."
              : required
                ? 'Clock in when you start. Your hours are counted from the clock.'
                : 'Clock in when you start, or type your hours below.'}
          </span>
        </div>
      </div>

      {geofenceResult ? (
        <div style={{
          fontSize: '0.78rem',
          padding: '4px 10px',
          borderRadius: '6px',
          margin: '6px 0',
          background: geofenceResult.badgeTone === 'success' ? '#dcfce7' : '#fef3c7',
          color: geofenceResult.badgeTone === 'success' ? '#15803d' : '#b45309',
        }}>
          {geofenceResult.badgeLabel}
        </div>
      ) : null}

      {!busyElsewhere ? (
        <form
          ref={clockInFormRef}
          action={clockIn}
          onSubmit={looksOffline() ? offlineSubmit('clock-in', 'Clocked in at this time — held on your phone until you’re back in signal ✓') : handleClockInSubmit}
        >
          <SaveButton
            className="btn primary"
            pendingLabel={acquiringGps ? 'Acquiring GPS & clocking in…' : 'Clocking in…'}
            savedLabel="Clocked in ✓"
            disabled={acquiringGps}
          >
            Clock in
          </SaveButton>
        </form>
      ) : null}
      {notes}
    </div>
  );
}
