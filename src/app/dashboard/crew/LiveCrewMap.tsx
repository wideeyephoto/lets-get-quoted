'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { loadGoogleMaps, googleMapAppearance } from '@/lib/maps-loader';
import { createAdvancedMarker } from '@/lib/advanced-markers';
import { formatUsdExact } from '@/lib/money-format';
import {
  resolveFreshness,
  resolveTechnicianStatus,
  formatElapsedShift,
  type CrewMapSnapshot,
  type TechnicianLocationSnapshot,
} from '@/lib/crew-location';
import { describeGeofenceDistance, feetToMeters } from '@/lib/crew-geofence';
import styles from './LiveCrewMap.module.css';

type FilterKey = 'all' | 'live' | 'en_route' | 'on_site' | 'off_site' | 'attention' | 'stale' | 'off_duty';

type Props = {
  initialSnapshot: CrewMapSnapshot;
  accountId: string;
  canViewPay: boolean;
  theme?: 'dark' | 'light';
};

function createTechMarkerContent(tech: TechnicianLocationSnapshot, isSelected: boolean): HTMLDivElement {
  const node = document.createElement('div');
  node.style.position = 'relative';
  node.style.cursor = 'pointer';
  node.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
  node.style.transform = isSelected ? 'scale(1.18)' : 'scale(1)';
  node.style.zIndex = isSelected ? '999' : '10';

  const badge = document.createElement('div');
  badge.style.display = 'flex';
  badge.style.alignItems = 'center';
  badge.style.gap = '6px';
  badge.style.padding = '5px 10px';
  badge.style.borderRadius = '20px';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = '700';
  badge.style.boxShadow = isSelected ? '0 4px 14px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.15)';
  badge.style.border = isSelected ? '2px solid #0284c7' : '1.5px solid #ffffff';
  badge.style.whiteSpace = 'nowrap';
  badge.style.color = '#ffffff';

  // Status-driven styling
  if (tech.status === 'on_site') {
    badge.style.background = '#15803d'; // Green
  } else if (tech.status === 'en_route') {
    badge.style.background = '#0284c7'; // Blue
  } else if (tech.status === 'off_site') {
    badge.style.background = '#dc2626'; // Red
  } else if (tech.status === 'location_uncertain' || tech.freshness === 'stale') {
    badge.style.background = '#d97706'; // Amber
  } else {
    badge.style.background = '#475569'; // Slate
  }

  // Pulsing Live Dot
  if (tech.freshness === 'live' && (tech.status === 'on_site' || tech.status === 'en_route')) {
    const dot = document.createElement('span');
    dot.style.width = '7px';
    dot.style.height = '7px';
    dot.style.borderRadius = '50%';
    dot.style.background = '#4ade80';
    dot.style.boxShadow = '0 0 6px #22c55e';
    badge.appendChild(dot);
  }

  const label = document.createElement('span');
  label.textContent = tech.crewName;
  badge.appendChild(label);

  node.appendChild(badge);
  return node;
}

function createJobSiteMarkerContent(label: string): HTMLDivElement {
  const node = document.createElement('div');
  node.style.display = 'flex';
  node.style.alignItems = 'center';
  node.style.gap = '5px';
  node.style.padding = '4px 8px';
  node.style.borderRadius = '6px';
  node.style.fontSize = '11px';
  node.style.fontWeight = '700';
  node.style.background = '#0f172a';
  node.style.color = '#ffffff';
  node.style.border = '1.5px solid #ffffff';
  node.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  node.style.whiteSpace = 'nowrap';

  const icon = document.createElement('span');
  icon.textContent = '🏢';
  node.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = label;
  node.appendChild(text);

  return node;
}

export default function LiveCrewMap({
  initialSnapshot,
  accountId,
  canViewPay,
  theme = 'light',
}: Props) {
  const [technicians, setTechnicians] = useState<TechnicianLocationSnapshot[]>(initialSnapshot.technicians);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSnapshot.technicians.find((t) => t.status === 'on_site' || t.status === 'en_route')?.crewId ||
    initialSnapshot.technicians[0]?.crewId ||
    null,
  );
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const jobMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const geofenceCircleRef = useRef<google.maps.Circle | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);

  // Periodic freshness tick every 5 seconds so countdowns update live
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTechnicians((prev) =>
        prev.map((t) => {
          if (!t.lastCapturedAt && !t.shiftStartedAt) return t;
          const { freshness, label: freshnessLabel } = resolveFreshness(t.lastCapturedAt, now);
          const { hours: elapsedHours, label: elapsedLabel } = formatElapsedShift(t.shiftStartedAt, now);
          return {
            ...t,
            freshness,
            freshnessLabel,
            elapsedHours,
            elapsedLabel,
          };
        }),
      );
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime Broadcast Subscription
  useEffect(() => {
    if (!accountId) return;

    const channelTopic = `account:${accountId}:crew-locations`;
    const channel = supabase.channel(channelTopic);

    channel
      .on('broadcast', { event: 'location_update' }, ({ payload }) => {
        if (!payload || !payload.crewId) return;

        setTechnicians((prev) => {
          const targetIndex = prev.findIndex((t) => t.crewId === payload.crewId);
          if (targetIndex === -1) return prev;

          const target = prev[targetIndex];
          const now = Date.now();
          const capturedAt = payload.capturedAt || new Date().toISOString();
          const { freshness, label: freshnessLabel } = resolveFreshness(capturedAt, now);

          const { status, statusLabel, statusTone, geofenceResult } = resolveTechnicianStatus({
            isOnShift: Boolean(target.shiftId || payload.shiftId),
            isEnRoute: target.status === 'en_route',
            locationState: {
              account_id: accountId,
              crew_id: payload.crewId,
              time_entry_id: payload.shiftId || target.shiftId,
              job_id: payload.jobId || target.activeJobId,
              lat: payload.lat,
              lng: payload.lng,
              accuracy_m: payload.accuracyMeters,
              heading_deg: payload.headingDeg,
              speed_mps: payload.speedMps,
              captured_at: capturedAt,
              received_at: new Date().toISOString(),
              expires_at: new Date(now + 10 * 60_000).toISOString(),
              source: 'shift',
              client_sequence: 1,
              permission_state: 'granted',
              created_at: capturedAt,
              updated_at: capturedAt,
            },
            jobCoord: target.jobCoord,
            geofenceRadiusFeet: initialSnapshot.geofenceRadiusFeet,
            freshness,
          });

          const updated: TechnicianLocationSnapshot = {
            ...target,
            lat: payload.lat,
            lng: payload.lng,
            accuracyMeters: payload.accuracyMeters ?? target.accuracyMeters,
            headingDeg: payload.headingDeg ?? target.headingDeg,
            speedMps: payload.speedMps ?? target.speedMps,
            lastCapturedAt: capturedAt,
            freshness,
            freshnessLabel,
            status,
            statusLabel,
            statusTone,
            distanceFromSiteFeet: geofenceResult?.distanceFeet ?? target.distanceFromSiteFeet,
            distanceLabel: geofenceResult?.distanceFeet != null ? describeGeofenceDistance(geofenceResult.distanceFeet) : target.distanceLabel,
            geofenceStatus: geofenceResult?.status ?? target.geofenceStatus,
          };

          const next = [...prev];
          next[targetIndex] = updated;
          return next;
        });
      })
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, initialSnapshot.geofenceRadiusFeet]);

  // Initialize Google Map Once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !containerRef.current || mapInstanceRef.current) return;

    let cancelled = false;

    loadGoogleMaps(key)
      .then(async () => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const g = window.google.maps;
        const [mapsLibrary, markerLibrary] = await Promise.all([
          g.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          g.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);

        if (cancelled || !containerRef.current) return;
        markerLibRef.current = markerLibrary;

        const map = new mapsLibrary.Map(containerRef.current, {
          ...googleMapAppearance(theme),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
          center: { lat: 40.7312, lng: -74.2731 },
          zoom: 12,
        });

        mapInstanceRef.current = map;
        setMapReady(true);
      })
      .catch((err) => {
        console.error('Google Maps initialization failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [theme]);

  // Synchronize Google Maps Markers and Overlays without Recreating the Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markerLib = markerLibRef.current;
    if (!map || !markerLib) return;

    const currentMarkers = markersRef.current;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    // 1. Update/Add/Remove Technician Markers
    for (const tech of technicians) {
      const hasLoc = tech.lat != null && tech.lng != null && Number.isFinite(tech.lat) && Number.isFinite(tech.lng);
      const isSelected = tech.crewId === selectedId;

      if (!hasLoc) {
        // Remove if previously existed
        const existing = currentMarkers.get(tech.crewId);
        if (existing) {
          existing.map = null;
          currentMarkers.delete(tech.crewId);
        }
        continue;
      }

      const pos = { lat: tech.lat!, lng: tech.lng! };
      bounds.extend(pos);
      hasCoords = true;

      let marker = currentMarkers.get(tech.crewId);
      const content = createTechMarkerContent(tech, isSelected);

      if (!marker) {
        marker = createAdvancedMarker(
          markerLib,
          {
            map,
            position: pos,
            title: `${tech.crewName} (${tech.statusLabel})`,
            zIndex: isSelected ? 999 : 10,
            gmpClickable: true,
          },
          content,
        );

        marker.addEventListener('gmp-click', () => {
          setSelectedId(tech.crewId);
        });

        currentMarkers.set(tech.crewId, marker);
      } else {
        marker.position = pos;
        marker.zIndex = isSelected ? 999 : 10;
        marker.replaceChildren(content);
      }
    }

    // 2. Selected Technician Overlay (Job Marker + Geofence Circle)
    const selectedTech = technicians.find((t) => t.crewId === selectedId);

    if (selectedTech?.jobCoord && selectedTech.jobCoord.lat != null && selectedTech.jobCoord.lng != null) {
      const jobPos = { lat: selectedTech.jobCoord.lat, lng: selectedTech.jobCoord.lng };
      bounds.extend(jobPos);

      // Job Marker
      const jobContent = createJobSiteMarkerContent(selectedTech.activeJobLabel || 'Job site');
      if (!jobMarkerRef.current) {
        jobMarkerRef.current = createAdvancedMarker(
          markerLib,
          {
            map,
            position: jobPos,
            title: selectedTech.activeJobLabel || 'Job site',
            zIndex: 5,
          },
          jobContent,
        );
      } else {
        jobMarkerRef.current.map = map;
        jobMarkerRef.current.position = jobPos;
        jobMarkerRef.current.replaceChildren(jobContent);
      }

      // Geofence Circle (radius in meters)
      const radiusMeters = feetToMeters(initialSnapshot.geofenceRadiusFeet || 200);
      if (!geofenceCircleRef.current) {
        geofenceCircleRef.current = new google.maps.Circle({
          map,
          center: jobPos,
          radius: radiusMeters,
          strokeColor: '#15803d',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#22c55e',
          fillOpacity: 0.12,
          clickable: false,
        });
      } else {
        geofenceCircleRef.current.setMap(map);
        geofenceCircleRef.current.setCenter(jobPos);
        geofenceCircleRef.current.setRadius(radiusMeters);
      }
    } else {
      if (jobMarkerRef.current) {
        jobMarkerRef.current.map = null;
      }
      if (geofenceCircleRef.current) {
        geofenceCircleRef.current.setMap(null);
      }
    }

    // Adjust viewport if we have valid coordinates
    if (hasCoords && !mapInstanceRef.current?.getBounds()?.isEmpty()) {
      if (selectedTech?.lat != null && selectedTech?.lng != null) {
        // Pan smoothly to selected technician
        map.panTo({ lat: selectedTech.lat, lng: selectedTech.lng });
      } else if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 50);
      }
    }
  }, [technicians, selectedId, mapReady, initialSnapshot.geofenceRadiusFeet]);

  // Filtering & Search
  const filteredTechnicians = useMemo(() => {
    return technicians.filter((tech) => {
      // Status filter
      if (filter === 'live' && !(tech.freshness === 'live' && (tech.status === 'on_site' || tech.status === 'en_route'))) {
        return false;
      }
      if (filter === 'en_route' && tech.status !== 'en_route') return false;
      if (filter === 'on_site' && tech.status !== 'on_site') return false;
      if (filter === 'off_site' && tech.status !== 'off_site') return false;
      if (filter === 'attention' && !(tech.status === 'off_site' || tech.status === 'location_uncertain')) {
        return false;
      }
      if (filter === 'stale' && (tech.status === 'off_duty' || tech.freshness === 'live')) return false;
      if (filter === 'off_duty' && tech.status !== 'off_duty') return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = tech.crewName.toLowerCase().includes(query);
        const matchesRole = tech.roleTitle.toLowerCase().includes(query);
        const matchesJob = (tech.activeJobLabel || '').toLowerCase().includes(query) ||
                           (tech.activeJobAddress || '').toLowerCase().includes(query);
        if (!matchesName && !matchesRole && !matchesJob) return false;
      }

      return true;
    });
  }, [technicians, filter, searchQuery]);

  const selectedTechnician = useMemo(
    () => technicians.find((t) => t.crewId === selectedId) || null,
    [technicians, selectedId],
  );

  const counts = useMemo(() => {
    return {
      total: technicians.length,
      live: technicians.filter((t) => t.freshness === 'live' && (t.status === 'on_site' || t.status === 'en_route')).length,
      enRoute: technicians.filter((t) => t.status === 'en_route').length,
      onSite: technicians.filter((t) => t.status === 'on_site').length,
      offSite: technicians.filter((t) => t.status === 'off_site').length,
      attention: technicians.filter((t) => t.status === 'off_site' || t.status === 'location_uncertain').length,
      staleOrUnavailable: technicians.filter((t) => t.status !== 'off_duty' && t.freshness !== 'live').length,
      offDuty: technicians.filter((t) => t.status === 'off_duty').length,
    };
  }, [technicians]);

  return (
    <div className={styles.mapContainer}>
      {/* ── Top Header & Connection Strip ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>📍 Live Crew GPS &amp; Dispatch</h2>
              <span className={styles.connectionBadge}>
                <span className={styles.connectionDot} />
                {realtimeConnected ? 'Realtime Connected' : 'Live Operations'}
              </span>
            </div>
            <p className={styles.subtitle}>
              Foreground technician location telemetry with automatic {initialSnapshot.geofenceRadiusFeet} ft job site geofence verification.
            </p>
          </div>

          <div className={styles.privacyNotice} title="Foreground tracking only occurs when the field app is open during active shifts">
            <span>🛡️ Foreground only · Expires on clock-out</span>
          </div>
        </div>

        {/* Operational Metrics Strip */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>On Duty</span>
            <span className={styles.metricValue}>{counts.total - counts.offDuty}</span>
          </div>
          <div className={styles.metricCard} style={{ background: '#f0fdf4', borderColor: '#dcfce7' }}>
            <span className={styles.metricLabel} style={{ color: '#166534' }}>Verified On-Site</span>
            <span className={styles.metricValue} style={{ color: '#15803d' }}>{counts.onSite}</span>
          </div>
          <div className={styles.metricCard} style={{ background: '#f0f9ff', borderColor: '#e0f2fe' }}>
            <span className={styles.metricLabel} style={{ color: '#0369a1' }}>En Route</span>
            <span className={styles.metricValue} style={{ color: '#0284c7' }}>{counts.enRoute}</span>
          </div>
          <div className={styles.metricCard} style={{ background: counts.offSite > 0 ? '#fef2f2' : '#ffffff', borderColor: counts.offSite > 0 ? '#fca5a5' : '#e2e8f0' }}>
            <span className={styles.metricLabel} style={{ color: counts.offSite > 0 ? '#991b1b' : '#64748b' }}>Off-Site Alerts</span>
            <span className={styles.metricValue} style={{ color: counts.offSite > 0 ? '#dc2626' : '#0f172a' }}>{counts.offSite}</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar: Filter Pills & Search ── */}
      <div className={styles.toolbar}>
        <div className={styles.filterPills} role="tablist" aria-label="Crew status filters">
          <button
            type="button"
            className={`${styles.pill} ${filter === 'all' ? styles.pillActive : ''}`}
            onClick={() => setFilter('all')}
          >
            All Crew ({counts.total})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${filter === 'live' ? styles.pillActive : ''}`}
            onClick={() => setFilter('live')}
          >
            🟢 Live Now ({counts.live})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${filter === 'on_site' ? styles.pillActive : ''}`}
            onClick={() => setFilter('on_site')}
          >
            📍 On Site ({counts.onSite})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${filter === 'en_route' ? styles.pillActive : ''}`}
            onClick={() => setFilter('en_route')}
          >
            🚗 En Route ({counts.enRoute})
          </button>
          {counts.offSite > 0 ? (
            <button
              type="button"
              className={`${styles.pill} ${styles.pillWarning} ${filter === 'off_site' ? styles.pillWarningActive : ''}`}
              onClick={() => setFilter('off_site')}
            >
              ⚠️ Off-Site ({counts.offSite})
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.pill} ${filter === 'stale' ? styles.pillActive : ''}`}
            onClick={() => setFilter('stale')}
          >
            ⏳ Stale ({counts.staleOrUnavailable})
          </button>
          <button
            type="button"
            className={`${styles.pill} ${filter === 'off_duty' ? styles.pillActive : ''}`}
            onClick={() => setFilter('off_duty')}
          >
            Off Duty ({counts.offDuty})
          </button>
        </div>

        <div className={styles.searchBox}>
          <span className={styles.searchIcon} aria-hidden="true">🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search tech, role, address…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Mobile Toggle Control */}
      <div className={styles.mobileToggle}>
        <button
          type="button"
          className={styles.mobileToggleBtn}
          onClick={() => setMobileView((v) => (v === 'map' ? 'list' : 'map'))}
        >
          {mobileView === 'map' ? '📋 Show Crew List' : '🗺️ Show Interactive Map'}
        </button>
      </div>

      {/* ── Main Two-Pane Split Layout ── */}
      <div className={styles.mainSplit}>
        {/* Left Pane: Interactive Google Map */}
        <div className={styles.mapPane}>
          <div ref={containerRef} className={styles.mapCanvas} />
          {!mapReady ? (
            <div className={styles.mapFallback}>
              <p>📍 Loading Live Operations Map…</p>
            </div>
          ) : null}
        </div>

        {/* Right Pane: Searchable & Accessible Crew Rail */}
        <div className={styles.crewRail}>
          {filteredTechnicians.length === 0 ? (
            <div className={styles.emptyState}>
              <span style={{ fontSize: '1.8rem' }}>👥</span>
              <strong className={styles.emptyStateTitle}>No technicians match</strong>
              <p className={styles.emptyStateCopy}>
                {technicians.length === 0
                  ? 'No crew members found on the roster. Add crew to begin location tracking.'
                  : 'Try selecting a different filter or clearing your search.'}
              </p>
            </div>
          ) : (
            <div className={styles.railList} role="list" aria-label="Technicians list">
              {filteredTechnicians.map((tech) => {
                const isSelected = tech.crewId === selectedId;
                const initials = tech.crewName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

                return (
                  <div
                    key={tech.crewId}
                    role="listitem"
                    tabIndex={0}
                    className={`${styles.crewCard} ${isSelected ? styles.crewCardSelected : ''}`}
                    onClick={() => setSelectedId(tech.crewId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(tech.crewId);
                      }
                    }}
                  >
                    <div className={styles.crewCardHeader}>
                      <div className={styles.crewIdentity}>
                        <div className={styles.avatar}>
                          {tech.avatarUrl ? <img src={tech.avatarUrl} alt="" /> : initials}
                        </div>
                        <div className={styles.nameBlock}>
                          <span className={styles.name}>{tech.crewName}</span>
                          <span className={styles.role}>{tech.roleTitle}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`${styles.badge} ${
                          tech.status === 'on_site'
                            ? styles.badgeSuccess
                            : tech.status === 'off_site'
                              ? styles.badgeDanger
                              : tech.status === 'en_route'
                                ? styles.badgeInfo
                                : tech.status === 'location_uncertain'
                                  ? styles.badgeWarn
                                  : styles.badgeNeutral
                        }`}
                      >
                        {tech.statusLabel}
                      </span>
                    </div>

                    {/* Active Job Context */}
                    {tech.activeJobLabel ? (
                      <div className={styles.cardJobBox}>
                        <span className={styles.cardJobLabel}>{tech.activeJobLabel}</span>
                        {tech.activeJobAddress ? (
                          <span className={styles.cardJobAddress}>{tech.activeJobAddress}</span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Footer: Freshness & Shift stats */}
                    <div className={styles.cardFooter}>
                      <span className={styles.freshnessText}>
                        {tech.freshness === 'live' ? '🟢' : '⏳'} {tech.freshnessLabel}
                      </span>
                      {tech.shiftStartedAt ? (
                        <span>Shift: <strong>{tech.elapsedLabel}</strong></span>
                      ) : (
                        <span>Off duty</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Technician Detail Drawer */}
          {selectedTechnician ? (
            <div className={styles.detailDrawer}>
              <div className={styles.drawerHeader}>
                <strong className={styles.drawerTitle}>Technician Details</strong>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setSelectedId(null)}
                  aria-label="Close technician details"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>GPS Accuracy:</span>
                  <strong>{selectedTechnician.accuracyLabel}</strong>
                </div>
                {selectedTechnician.speedLabel ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Movement:</span>
                    <strong>{selectedTechnician.speedLabel} {selectedTechnician.headingLabel}</strong>
                  </div>
                ) : null}
                {selectedTechnician.shiftStartedAt ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Shift Started:</span>
                    <strong>{new Date(selectedTechnician.shiftStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                ) : null}
                {canViewPay && selectedTechnician.hourlyRate ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                    <span style={{ color: '#64748b' }}>Labor Accrued:</span>
                    <strong>{formatUsdExact(selectedTechnician.estimatedLaborCost || 0)} ({formatUsdExact(selectedTechnician.hourlyRate)}/hr)</strong>
                  </div>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className={styles.drawerActions}>
                {selectedTechnician.activeJobId ? (
                  <Link
                    href={`/dashboard/jobs/${selectedTechnician.activeJobId}`}
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  >
                    📂 Open Job
                  </Link>
                ) : null}
                {selectedTechnician.phone ? (
                  <a href={`tel:${selectedTechnician.phone}`} className={styles.actionBtn}>
                    📞 Call Tech
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
