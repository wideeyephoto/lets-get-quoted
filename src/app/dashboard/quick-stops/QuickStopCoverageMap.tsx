'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { circleMarkerContent, createAdvancedMarker } from '@/lib/advanced-markers';
import { googleMapAppearance, loadGoogleMaps } from '@/lib/maps-loader';
import type { RouteStop, MultiDayRouteMap } from '@/lib/quick-stop-route';
import type { PriorityZone } from '@/lib/quick-stop-zones';

export type CoverageDayOption = {
  key: string;
  label: string;
  weekdayName: string;
};

export type CoverageMapProps = {
  stops: RouteStop[];
  multiDayStops?: MultiDayRouteMap;
  daysWindow?: CoverageDayOption[];
  defaultDayKey?: string;
  radiusMiles: number;
  /** Null when nothing is scheduled — the map says so rather than centring on the ocean. */
  emptyReason: string | null;
  zones: PriorityZone[];
  /**
   * Somewhere to open the map when there is nothing to fit to — the last place
   * this account worked. Without it a quiet day means no map at all, and the
   * priority areas below have nothing to be shown against.
   */
  fallbackCenter?: { lat: number; lng: number } | null;
};

const METERS_PER_MILE = 1609.344;

const ROUTE_COLOR = '#ff7a21';
const ZONE_COLOR = '#4ade80';
const PRIORITY_COLOR = '#a78bfa';

type MapTheme = 'dark' | 'light';
const THEME_KEY = 'qs-coverage-map-theme';

type TimelineSegment =
  | { type: 'stop'; index: number; time: string; label: string; scope?: string | null }
  | { type: 'opening'; durationMinutes: number; label: string };

function buildTimelineSegments(dayStops: RouteStop[]): TimelineSegment[] {
  if (!dayStops || dayStops.length === 0) return [];
  const segments: TimelineSegment[] = [];

  const parseMinutes = (timeStr?: string | null): number | null => {
    if (!timeStr) return null;
    const parts = timeStr.split(':').map(Number);
    if (!Number.isFinite(parts[0])) return null;
    return parts[0] * 60 + (parts[1] || 0);
  };

  const formatGap = (mins: number): string => {
    if (mins < 60) return `${mins}m opening`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs}-hour opening`;
  };

  for (let i = 0; i < dayStops.length; i++) {
    const stop = dayStops[i];
    segments.push({
      type: 'stop',
      index: i + 1,
      time: stop.timeLabel || `Stop ${i + 1}`,
      label: stop.clientName ? `${stop.clientName}` : `Job #${i + 1}`,
      scope: stop.scope,
    });

    if (i < dayStops.length - 1) {
      const nextStop = dayStops[i + 1];
      const startCurrent = parseMinutes(stop.scheduledTime);
      const estHours = stop.estimatedHours && stop.estimatedHours > 0 ? stop.estimatedHours : 1.0;
      const endCurrent = startCurrent !== null ? startCurrent + Math.round(estHours * 60) : null;
      const startNext = parseMinutes(nextStop.scheduledTime);

      if (endCurrent !== null && startNext !== null && startNext > endCurrent) {
        const gapMins = startNext - endCurrent;
        if (gapMins >= 25) {
          segments.push({
            type: 'opening',
            durationMinutes: gapMins,
            label: formatGap(gapMins),
          });
        }
      }
    }
  }

  return segments;
}

export default function QuickStopCoverageMap({
  stops,
  multiDayStops,
  daysWindow = [],
  defaultDayKey,
  radiusMiles,
  emptyReason,
  zones,
  fallbackCenter = null,
}: CoverageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [theme, setTheme] = useState<MapTheme>('dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const gearMenuId = useId();

  // Multi-day selection state
  const initialDay = defaultDayKey || daysWindow[0]?.key || '';
  const [selectedDayKey, setSelectedDayKey] = useState<string>(initialDay);

  const activeStops = multiDayStops && selectedDayKey && multiDayStops[selectedDayKey]
    ? multiDayStops[selectedDayKey]
    : stops;

  const timeline = buildTimelineSegments(activeStops);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') setTheme(saved);
    } catch {
      // Private mode fallback
    }
  }, []);

  const canDrawMap = activeStops.length > 0 || zones.length > 0 || Boolean(fallbackCenter);

  useEffect(() => {
    if (!canDrawMap) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    const mapMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    const drawings: Array<google.maps.Circle | google.maps.Polyline> = [];
    loadGoogleMaps(key)
      .then(async () => {
        if (cancelled || !containerRef.current || !window.google) return;
        const g = window.google.maps;
        const markerLibrary = (await g.importLibrary('marker')) as google.maps.MarkerLibrary;
        if (cancelled || !containerRef.current) return;

        const map = new g.Map(containerRef.current, {
          ...googleMapAppearance(theme),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          backgroundColor: theme === 'dark' ? '#16222f' : '#eef1f5',
        });

        const bounds = new g.LatLngBounds();

        for (const stop of activeStops) {
          const center = { lat: stop.lat, lng: stop.lng };
          const circle = new g.Circle({
            map,
            center,
            radius: radiusMiles * METERS_PER_MILE,
            strokeColor: ZONE_COLOR,
            strokeOpacity: 0.65,
            strokeWeight: 1.5,
            fillColor: ZONE_COLOR,
            fillOpacity: 0.1,
            clickable: false,
          });
          drawings.push(circle);
          const circleBounds = circle.getBounds();
          if (circleBounds) bounds.union(circleBounds);
        }

        for (const zone of zones) {
          const circle = new g.Circle({
            map,
            center: { lat: zone.centerLat, lng: zone.centerLng },
            radius: zone.radiusMiles * METERS_PER_MILE,
            strokeColor: PRIORITY_COLOR,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: PRIORITY_COLOR,
            fillOpacity: 0.12,
            clickable: false,
          });
          drawings.push(circle);
          const zoneBounds = circle.getBounds();
          if (zoneBounds) bounds.union(zoneBounds);
        }

        if (activeStops.length > 1) {
          drawings.push(
            new g.Polyline({
              map,
              path: activeStops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
              strokeColor: ROUTE_COLOR,
              strokeOpacity: 0.9,
              strokeWeight: 3,
            }),
          );
        }

        activeStops.forEach((stop, index) => {
          const position = { lat: stop.lat, lng: stop.lng };
          bounds.extend(position);
          const marker = createAdvancedMarker(
            markerLibrary,
            {
              map,
              position,
              title: stop.timeLabel ? `Stop ${index + 1} · ${stop.timeLabel}` : `Stop ${index + 1}`,
              anchorLeft: '-50%',
              anchorTop: '-50%',
            },
            circleMarkerContent({
              diameter: 22,
              fill: ROUTE_COLOR,
              borderWidth: 1.5,
              label: String(index + 1),
            }),
          );
          mapMarkers.push(marker);
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 32);
          const listener = g.event.addListenerOnce(map, 'idle', () => {
            const zoom = map.getZoom();
            if (typeof zoom === 'number' && zoom > 14) map.setZoom(14);
          });
          void listener;
        } else if (fallbackCenter) {
          map.setCenter(fallbackCenter);
          map.setZoom(11);
        }

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      for (const marker of mapMarkers) marker.map = null;
      for (const drawing of drawings) drawing.setMap(null);
    };
  }, [activeStops, radiusMiles, theme, zones, fallbackCenter, canDrawMap]);

  function chooseTheme(next: MapTheme) {
    setTheme(next);
    setMenuOpen(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignored
    }
  }

  const selectedDayLabel = daysWindow.find((d) => d.key === selectedDayKey)?.label || 'Today';

  return (
    <div className="qs-coverage" data-theme={theme} style={{ marginBottom: '1.25rem' }}>
      <div className="qs-coverage-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Route Coverage</p>
          <h2 style={{ margin: '0.2rem 0' }}>Where a Quick Stop can land</h2>
          <p className="qs-coverage-sub" style={{ margin: 0 }}>
            {activeStops.length > 0
              ? `${activeStops.length} stop${activeStops.length === 1 ? '' : 's'} scheduled for ${selectedDayLabel} · ${radiusMiles}-mile detour reach from any stop.`
              : `No scheduled stops for ${selectedDayLabel}.`}
          </p>
        </div>

        {/* Multi-Day Selection Pills */}
        {daysWindow.length > 1 ? (
          <div className="qs-day-pills" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {daysWindow.map((day) => {
              const dayStopCount = multiDayStops?.[day.key]?.length ?? (day.key === initialDay ? stops.length : 0);
              const isSelected = selectedDayKey === day.key;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDayKey(day.key)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 700 : 500,
                    border: '1px solid',
                    borderColor: isSelected ? '#ff7a21' : 'var(--edge-t14, rgba(255,255,255,0.1))',
                    background: isSelected ? 'rgba(255,122,33,0.12)' : 'rgba(var(--tint, 255,255,255), 0.03)',
                    color: isSelected ? 'var(--text)' : 'var(--muted)',
                    cursor: 'pointer',
                    minHeight: '36px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <span>{day.label}</span>
                  <small style={{ opacity: 0.8, fontSize: '0.72rem' }}>({dayStopCount})</small>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="qs-coverage-frame" style={{ marginTop: '0.75rem' }}>
        {activeStops.length === 0 && zones.length === 0 ? (
          <div className="qs-no-route-card" style={{ padding: '1.75rem 1.25rem', background: 'rgba(var(--tint, 255,255,255), 0.02)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <span style={{ fontSize: '1.75rem', lineHeight: 1 }} aria-hidden="true">📍</span>
            <div>
              <strong style={{ fontSize: '1rem', color: 'var(--text)', display: 'block', marginBottom: '0.25rem' }}>
                No route available for {selectedDayLabel}
              </strong>
              <p style={{ margin: '0 0 0.85rem', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                {emptyReason || `Nothing geocoded on your schedule for ${selectedDayLabel} yet. Once scheduled jobs with addresses exist, this map shows exactly where a Quick Stop fits.`}
              </p>
              <Link href="/dashboard/schedule" className="btn secondary" style={{ minHeight: '40px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                Open schedule →
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className="qs-coverage-canvas"
              role="region"
              aria-label={`${selectedDayLabel}'s route with your ${radiusMiles}-mile detour limit drawn around each stop`}
            />
            {status === 'loading' ? <p className="qs-coverage-empty">Loading map…</p> : null}
            {status === 'error' ? (
              <p className="qs-coverage-empty">
                Map preview unavailable. Detour limit is {radiusMiles} miles around scheduled stops.
              </p>
            ) : null}

            <div className="qs-coverage-gear">
              <button
                type="button"
                className="qs-coverage-gear-btn"
                aria-label="Map appearance"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? gearMenuId : undefined}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
              {menuOpen ? (
                <div id={gearMenuId} className="qs-coverage-gear-menu" role="group" aria-label="Map appearance">
                  <button type="button" className={theme === 'dark' ? 'is-active' : undefined} onClick={() => chooseTheme('dark')}>
                    Dark
                  </button>
                  <button type="button" className={theme === 'light' ? 'is-active' : undefined} onClick={() => chooseTheme('light')}>
                    Light
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Route Timeline & Gap Openings Strip */}
      {timeline.length > 0 ? (
        <div
          className="qs-timeline-strip"
          style={{
            marginTop: '0.85rem',
            padding: '0.85rem 1rem',
            borderRadius: '12px',
            background: 'rgba(var(--tint, 255, 255, 255), 0.025)',
            border: '1px solid var(--edge-t10, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Route Timeline &amp; Openings
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {activeStops.length} {activeStops.length === 1 ? 'stop' : 'stops'} scheduled
            </span>
          </div>

          <div
            className="qs-timeline-flow"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              flexWrap: 'wrap',
              fontSize: '0.82rem',
            }}
          >
            {timeline.map((seg, idx) => {
              if (seg.type === 'stop') {
                return (
                  <span
                    key={`stop-${idx}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.25rem 0.55rem',
                      borderRadius: '6px',
                      background: 'rgba(255, 122, 33, 0.1)',
                      border: '1px solid rgba(255, 122, 33, 0.25)',
                      color: 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: '#ff7a21', fontWeight: 800 }}>#{seg.index}</span>
                    <span>{seg.time}</span>
                    <small style={{ color: 'var(--muted)', fontWeight: 400 }}>({seg.label})</small>
                  </span>
                );
              }
              return (
                <span
                  key={`open-${idx}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    background: 'rgba(52, 199, 123, 0.12)',
                    border: '1px solid rgba(52, 199, 123, 0.3)',
                    color: '#34c77b',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                  }}
                  title="Available time window between stops where a Quick Stop fits"
                >
                  <span aria-hidden="true">🟢</span>
                  <span>{seg.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <ul className="qs-coverage-legend" style={{ marginTop: '0.75rem' }}>
        <li><span className="qs-key-stop" aria-hidden="true" />Scheduled work</li>
        <li><span className="qs-key-zone" aria-hidden="true" />Within {radiusMiles} miles — inside detour limit</li>
        {zones.length > 0 ? (
          <li><span className="qs-key-priority" aria-hidden="true" />Priority area — worth a longer drive</li>
        ) : null}
      </ul>
    </div>
  );
}
