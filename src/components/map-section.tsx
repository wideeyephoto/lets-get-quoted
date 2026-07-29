'use client';

import { useState } from 'react';
import PinMap, { type MapPin } from './pin-map';

// Collapsible map section shared by Leads, Jobs, and Schedule. The Google Map
// only mounts once the owner opens it, so pages that don't need it pay nothing
// and the map always initializes at a real size.
export default function MapSection({
  pins,
  title = 'Jobs & leads map',
  subtitle = 'See where your work is so you can batch nearby estimates and jobs.',
  alwaysOpen = false,
}: {
  pins: MapPin[];
  title?: string;
  subtitle?: string;
  // alwaysOpen: no self-toggle, map is always shown (visibility is controlled
  // elsewhere — e.g. the view gear on Leads/Jobs). Default false keeps the
  // built-in Show/Hide button (used on Schedule, which has no gear).
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const shown = alwaysOpen || open;
  return (
    <section className="panel workspace-section-card">
      <div className="map-section-head">
        <div className="section-heading workspace-section-heading" style={{ margin: 0 }}>
          <p className="eyebrow">Map</p>
          <h2>{title}</h2>
        </div>
        {alwaysOpen ? null : (
          <button type="button" className="btn secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide map' : `Show map (${pins.length})`}
          </button>
        )}
      </div>
      {shown ? (
        <>
          <p className="map-section-sub">{subtitle}</p>
          <PinMap pins={pins} />
        </>
      ) : null}
    </section>
  );
}
