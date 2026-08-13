'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
// One shared loader for the whole app — see lib/maps-loader for why a second
// copy of the module-scoped promise would inject a second <script>.
import { createAdvancedMarker } from '@/lib/advanced-markers';
import { googleMapAppearance, loadGoogleMaps } from '@/lib/maps-loader';
import { WORKFLOW_STAGE_LABEL } from '@/lib/workflow-stages';

// A pin on the dashboard map. `kind` drives the marker color + legend.
export type MapPinKind = 'lead' | 'unscheduled' | 'scheduled';
export type MapPinRow = { label: string; value: string };
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  kind: MapPinKind;
  label: string;
  sublabel?: string;
  href: string;
  rows?: MapPinRow[];
};

const PIN_COLORS: Record<MapPinKind, string> = {
  lead: '#ff7a21', // needs response
  unscheduled: '#ffd166', // approved, no date yet
  scheduled: '#4ade80', // has a date
};

// Straight from the canonical stage names, so the legend and the pipeline agree.
const KIND_LABEL: Record<MapPinKind, string> = {
  lead: WORKFLOW_STAGE_LABEL.needs_response,
  unscheduled: WORKFLOW_STAGE_LABEL.approved,
  scheduled: WORKFLOW_STAGE_LABEL.scheduled,
};

const LEGEND: MapPinKind[] = ['lead', 'unscheduled', 'scheduled'];

// A Material-style teardrop pin (24×27, tip at 12,27) — far more visible on a
// light map than a small circle, with a dark ring so even the gold pins pop.
// Keeping the original SVG geometry avoids a visual size jump during the move
// from legacy Symbols to DOM-backed Advanced Markers.
const PIN_PATH = 'M12 0C7.03 0 3 4.03 3 9c0 6.75 9 18 9 18s9-11.25 9-18c0-4.97-4.03-9-9-9z';

function pinGraphic(color: string, active: boolean, mini = false): SVGSVGElement {
  const scale = (active ? 1.85 : 1.35) * (mini ? 0.72 : 1);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 27');
  svg.setAttribute('width', String(24 * scale));
  svg.setAttribute('height', String(27 * scale));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PIN_PATH);
  path.setAttribute('fill', color);
  path.setAttribute('stroke', active ? '#f7f5ef' : '#0b1220');
  path.setAttribute('stroke-width', active ? '2.4' : '1.5');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

/**
 * Move co-located pins onto a small ring around their shared point.
 *
 * Deterministic — same input, same output — so a marker does not hop to a new
 * spot on every render. The offset is ~12 metres at the equator: enough to
 * separate them at street zoom, small enough that nothing lands on the wrong
 * street.
 */
function spreadCoLocated(pins: MapPin[]): MapPin[] {
  const groups = new Map<string, MapPin[]>();
  for (const pin of pins) {
    const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(pin);
    else groups.set(key, [pin]);
  }

  const out: MapPin[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      out.push(bucket[0]);
      continue;
    }
    const radius = 0.00011;
    // Sorted by id so the ring order does not depend on the array order.
    const ordered = [...bucket].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((pin, index) => {
      const angle = (2 * Math.PI * index) / ordered.length;
      out.push({
        ...pin,
        lat: pin.lat + radius * Math.cos(angle),
        // Longitude degrees shrink with latitude; without this the ring is an
        // ellipse that collapses to a line near the poles.
        lng: pin.lng + (radius * Math.sin(angle)) / Math.max(0.2, Math.cos((pin.lat * Math.PI) / 180)),
      });
    });
  }
  // Keep the caller's order, so `pins.find(...)` elsewhere still behaves.
  const byId = new Map(out.map((pin) => [pin.id, pin]));
  return pins.map((pin) => byId.get(pin.id) ?? pin);
}

export default function PinMap({
  pins: rawPins,
  variant = 'large',
  theme = 'dark',
  legendAccessory,
  focusPinId = null,
  onPinClick,
  initialHidden,
  onVisibleCountChange,
  spreadOverlap = false,
}: {
  pins: MapPin[];
  variant?: 'large' | 'mini';
  theme?: 'dark' | 'light';
  legendAccessory?: ReactNode;
  focusPinId?: string | null;
  onPinClick?: (pin: MapPin) => void;
  /**
   * Pin kinds switched off before anybody touches the legend.
   *
   * Smoothie opens on leads and quotes-out only: a scheduled job is work you
   * have already won, and on a busy territory it buries the two kinds you came
   * to this page to act on. Still a legend toggle, so they are one click away
   * and the legend still says how many there are.
   *
   * OMITTED means nothing hidden, which is what every other caller gets — the
   * jobs map and the customers map are unchanged.
   */
  initialHidden?: MapPinKind[];
  /**
   * How many pins are currently drawn, whenever that changes.
   *
   * The page outside the map needs this to label a "Map (n)" control honestly:
   * hiding a layer has to move that number, or it is counting something the map
   * is not showing.
   */
  onVisibleCountChange?: (count: number) => void;
  /**
   * Fan out pins that sit on the same spot so each one is separately clickable.
   *
   * Two leads at one address currently draw one marker on top of another and
   * the lower one cannot be clicked, hovered or reached at all — it is not
   * merely crowded, it is missing. This is not clustering (no library here can
   * do that offline, and the CSP forbids fetching one); it is the part of
   * clustering that matters at a contractor's scale, which is tens of pins on
   * a territory rather than thousands on a continent.
   *
   * Opt-in so the jobs and customers maps are untouched.
   */
  spreadOverlap?: boolean;
}) {
  const pins = useMemo(() => (spreadOverlap ? spreadCoLocated(rawPins) : rawPins), [rawPins, spreadOverlap]);
  const mini = variant === 'mini';
  const containerRef = useRef<HTMLDivElement>(null);
  // One per instance: two maps on a page must not share an aria-describedby.
  const mapId = useId();
  const markersRef = useRef<{
    id: string;
    kind: MapPinKind;
    marker: google.maps.marker.AdvancedMarkerElement;
  }[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  // Held in a ref because the map is built once per pin-set (the effect keys on
  // `sig`), so a handler captured in that closure would go stale.
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<MapPin | null>(null);
  // Which pin kinds are switched off, by clicking their legend entry. Held per
  // map rather than saved: it's a "let me see this without the noise" gesture
  // while you work, not a setting.
  // Read once, as lazy initial state. A prop array is a new identity every
  // render, so syncing it in an effect would re-hide a layer the moment
  // somebody switched it on.
  const [hidden, setHidden] = useState<Set<MapPinKind>>(() => new Set(initialHidden ?? []));
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  // How many of each kind, so a legend entry says what turning it off costs —
  // and so a kind with nothing on the map can't be toggled at all.
  const counts = useMemo(() => {
    const tally: Record<MapPinKind, number> = { lead: 0, unscheduled: 0, scheduled: 0 };
    for (const pin of pins) tally[pin.kind] += 1;
    return tally;
  }, [pins]);
  const visibleCount = pins.filter((pin) => !hidden.has(pin.kind)).length;

  // Reported through a ref so a caller passing an inline arrow — which is a new
  // function every render — cannot turn this into a render loop.
  const reportRef = useRef(onVisibleCountChange);
  reportRef.current = onVisibleCountChange;
  useEffect(() => {
    reportRef.current?.(visibleCount);
  }, [visibleCount]);

  // Re-init only when the actual pin set changes (parent passes a fresh array each render).
  const sig = useMemo(() => `${theme}|` + pins.map((p) => `${p.id}:${p.lat},${p.lng}:${p.kind}`).join('|'), [pins, theme]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const container = containerRef.current;
    if (!apiKey || !container || pins.length === 0) {
      setStatus(pins.length === 0 ? 'ready' : 'error');
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let mapClickListener: google.maps.MapsEventListener | null = null;
    const idleListeners: google.maps.MapsEventListener[] = [];
    const markerListenerCleanups: Array<() => void> = [];
    setStatus('loading');
    setSelected(null);

    loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !window.google) return;
        const g = window.google.maps;
        const [mapsLibrary, markerLibrary] = await Promise.all([
          g.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          g.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);
        if (cancelled) return;
        const map = new mapsLibrary.Map(
          container,
          mini
            ? { ...googleMapAppearance(theme), disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false, clickableIcons: false, zoomControl: false }
            : { ...googleMapAppearance(theme), mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false },
        );

        mapRef.current = map;

        const bounds = new g.LatLngBounds();
        for (const { marker } of markersRef.current) marker.map = null;
        markersRef.current = [];
        for (const pin of pins) {
          const position = { lat: pin.lat, lng: pin.lng };
          bounds.extend(position);
          const marker = createAdvancedMarker(markerLibrary, {
            map: hiddenRef.current.has(pin.kind) ? null : map,
            position,
            title: pin.label,
            gmpClickable: true,
          }, pinGraphic(PIN_COLORS[pin.kind], false, mini));
          // Mini map: a click jumps straight to the record (no room for a card).
          const handleMarkerClick = () => {
            if (mini) { window.location.href = pin.href; return; }
            setSelected(pin);
            // The page decides what "go to this one" means — scroll its row
            // into view, open it in the Focus pane — rather than the map
            // assuming a navigation.
            onPinClickRef.current?.(pin);
          };
          marker.addEventListener('gmp-click', handleMarkerClick);
          markerListenerCleanups.push(() => marker.removeEventListener('gmp-click', handleMarkerClick));
          markersRef.current.push({ id: pin.id, kind: pin.kind, marker });
        }
        // Large map only: clicking empty map closes the detail card.
        if (!mini) mapClickListener = map.addListener('click', () => setSelected(null));

        // Fit to the pins, but never zoom past a neighborhood — a single pin or a
        // tight cluster would otherwise slam to street level.
        const MAX_ZOOM = 14;
        const fit = () => {
          if (pins.length === 1) {
            map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
            map.setZoom(11);
            return;
          }
          map.fitBounds(bounds, 56);
          idleListeners.push(g.event.addListenerOnce(map, 'idle', () => {
            const z = map.getZoom();
            if (typeof z === 'number' && z > MAX_ZOOM) map.setZoom(MAX_ZOOM);
          }));
        };
        fit();
        resizeObserver = new ResizeObserver(() => {
          if (container.clientWidth > 0) fit();
        });
        resizeObserver.observe(container);
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapClickListener?.remove();
      for (const listener of idleListeners) listener.remove();
      for (const removeListener of markerListenerCleanups) removeListener();
      for (const { marker } of markersRef.current) marker.map = null;
      markersRef.current = [];
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Center on one pin when the page asks — the jobs pipeline points this at
  // whichever job is open, so the map follows the selection instead of showing
  // the same whole-territory view whatever you're looking at.
  //
  // A job with no geocoded address has no pin at all (see getMapPins), and so
  // does a completed or archived one. Nothing happens in that case rather than
  // jumping somewhere misleading.
  useEffect(() => {
    if (mini || !focusPinId || status !== 'ready') return;
    const map = mapRef.current;
    const pin = pins.find((p) => p.id === focusPinId);
    if (!map || !pin) return;
    map.panTo({ lat: pin.lat, lng: pin.lng });
    const zoom = map.getZoom();
    // Close in, but only if we're further out — no yo-yo if you're already there.
    if (typeof zoom === 'number' && zoom < 13) map.setZoom(13);
    setSelected(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, sig, status, mini]);

  // Emphasize the selected marker + wire Escape-to-close (large map only).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const { kind, marker } of markersRef.current) {
      marker.map = hidden.has(kind) ? null : map;
    }
    // A card left open over a pin that's no longer drawn is a card about
    // nothing.
    setSelected((current) => (current && hidden.has(current.kind) ? null : current));
  }, [hidden, sig]);

  useEffect(() => {
    if (mini) return;
    for (const { id, marker } of markersRef.current) {
      const source = pins.find((candidate) => candidate.id === id);
      if (source) marker.replaceChildren(pinGraphic(PIN_COLORS[source.kind], id === selected?.id, mini));
    }
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sig]);

  if (mini) {
    return (
      <div className="pin-map-mini" aria-label={`Map — ${pins.length} location${pins.length === 1 ? '' : 's'}`} title="Leads &amp; jobs map">
        <div ref={containerRef} className="pin-map-mini-canvas" />
      </div>
    );
  }

  return (
    <div className="pin-map-shell">
      <div className="pin-map-wrap">
        {/* HOW TO GET AROUND IT, said once, for the people who need telling.
            The markers ARE keyboard reachable — Google gives the marker layer a
            single tab stop and roves between markers on the arrows, which is the
            right pattern and which we verified end to end: Tab lands on the
            first pin, ArrowRight/Down walk the rest, Enter opens the card.
            What was missing is that nothing said so, so a keyboard user tabbed
            onto one pin out of eighteen and had no reason to think there were
            seventeen more behind it. */}
        <p className="sr-only" id={`${mapId}-help`}>
          {pins.length} {pins.length === 1 ? 'place' : 'places'} on this map. Press Tab to reach the pins, then the
          arrow keys to move between them and Enter to open one. Every place is also a row in the list beside the map.
        </p>
        <div
          ref={containerRef}
          className="pin-map"
          role="application"
          aria-label={`Map of leads and jobs, ${pins.length} ${pins.length === 1 ? 'place' : 'places'}`}
          aria-describedby={`${mapId}-help`}
        />
        {selected ? (
          <div className="pin-card" role="dialog" aria-label={`${selected.label} details`}>
            <button type="button" className="pin-card-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
            <span className="pin-card-kind" data-kind={selected.kind}>{KIND_LABEL[selected.kind]}</span>
            <strong className="pin-card-name">{selected.label}</strong>
            {selected.sublabel ? <span className="pin-card-sub">{selected.sublabel}</span> : null}
            {selected.rows && selected.rows.length > 0 ? (
              <dl className="pin-card-rows">
                {selected.rows.map((row) => (
                  <div className="pin-card-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <a className="pin-card-open" href={selected.href}>Open &rarr;</a>
          </div>
        ) : null}
      </div>
      {pins.length === 0 ? (
        <div className="pin-map-empty">No mapped locations yet — addresses are geocoded as leads and jobs come in.</div>
      ) : null}
      {status === 'error' ? <div className="pin-map-empty">Map unavailable.</div> : null}
      {/* The legend is the filter. It already names every kind of pin and shows
          its color, so making it clickable adds a control without adding a
          control — and on a busy map "just the leads" is the first thing
          anybody wants. */}
      <div className="pin-map-legend">
        {LEGEND.map((kind) => {
          const count = counts[kind];
          const off = hidden.has(kind);
          return (
            <button
              key={kind}
              type="button"
              className="pin-map-legend-item"
              aria-pressed={!off}
              data-off={off || undefined}
              disabled={count === 0}
              title={
                count === 0
                  ? `No ${KIND_LABEL[kind].toLowerCase()} pins on this map`
                  : off
                    ? `Show ${KIND_LABEL[kind].toLowerCase()}`
                    : `Hide ${KIND_LABEL[kind].toLowerCase()}`
              }
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(kind)) next.delete(kind);
                  else next.add(kind);
                  return next;
                })
              }
            >
              <span className="pin-map-dot" style={{ background: PIN_COLORS[kind] }} aria-hidden="true" />
              {KIND_LABEL[kind]}
              <b>{count}</b>
            </button>
          );
        })}
        {hidden.size > 0 ? (
          <button type="button" className="pin-map-legend-reset" onClick={() => setHidden(new Set())}>
            Show all
          </button>
        ) : null}
        {legendAccessory ? <span className="pin-map-legend-accessory">{legendAccessory}</span> : null}
      </div>
      {/* Every pin switched off looks identical to a broken map otherwise. */}
      {pins.length > 0 && visibleCount === 0 ? (
        <p className="pin-map-allhidden">All pin types are hidden. Turn one back on in the legend.</p>
      ) : null}
    </div>
  );
}
