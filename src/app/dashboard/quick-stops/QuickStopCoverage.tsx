'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import type { RouteStop } from '@/lib/quick-stop-route';
import type { PriorityZone } from '@/lib/quick-stop-zones';
import QuickStopCoverageMap from './QuickStopCoverageMap';
import { deleteQuickStopZoneAction, saveQuickStopZoneAction } from './actions';

// The coverage map plus the priority areas drawn on it.
//
// A client wrapper because placing a zone is a conversation between the map and
// a form — tap the map, then name it — and the map cannot own the form without
// knowing about server actions.

type Props = {
  stops: RouteStop[];
  radiusMiles: number;
  emptyReason: string | null;
  zones: PriorityZone[];
  zonesAvailable: boolean;
};

type Draft = { lat: number; lng: number; radiusMiles: number };

export default function QuickStopCoverage({ stops, radiusMiles, emptyReason, zones, zonesAvailable }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [placing, setPlacing] = useState(false);

  function pickCenter(point: { lat: number; lng: number }) {
    if (!placing) return;
    setDraft((current) => ({ lat: point.lat, lng: point.lng, radiusMiles: current?.radiusMiles ?? 2 }));
  }

  return (
    <>
      <QuickStopCoverageMap
        stops={stops}
        radiusMiles={radiusMiles}
        emptyReason={emptyReason}
        zones={zones}
        draft={draft}
        onPickCenter={placing ? pickCenter : undefined}
      />

      {zonesAvailable ? (
        <section className="panel workspace-section-card qs-zones">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Priority areas</p>
            <h2>Places worth a longer drive</h2>
          </div>

          <p className="cash-bills-lead">
            {/* Said plainly, because the alternative version of this feature —
                one that picks the areas FOR them out of income data — is the one
                people expect, and it is not what this is. */}
            Your detour limit is {radiusMiles} miles everywhere by default. Draw an area here and Quick
            Stops inside it are worth going further for. You choose the areas and why — a subdivision
            with big lots, a street you already own, somewhere you&rsquo;re trying to grow.
          </p>

          {zones.length > 0 ? (
            <ul className="cash-bill-list">
              {zones.map((zone) => (
                <li key={zone.id} className="cash-bill">
                  <div className="cash-bill-main">
                    <strong>{zone.label}</strong>
                    <small>
                      {zone.radiusMiles} mile{zone.radiusMiles === 1 ? '' : 's'} across · worth driving up to{' '}
                      {zone.maxDetourMiles} mile{zone.maxDetourMiles === 1 ? '' : 's'} off route
                    </small>
                  </div>
                  <div className="cash-bill-actions">
                    <form action={deleteQuickStopZoneAction.bind(null, zone.id)}>
                      <button type="submit" className="linklike danger">Remove</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {placing ? (
            <form action={saveQuickStopZoneAction} className="cash-bill-form qs-zone-form">
              <p className="cash-bill-form-head">
                {draft ? 'Name this area' : 'Tap the middle of the area on the map above'}
              </p>
              <input type="hidden" name="centerLat" value={draft?.lat ?? ''} />
              <input type="hidden" name="centerLng" value={draft?.lng ?? ''} />
              <div className="cash-bill-form-grid">
                <label className="cash-bill-field wide">
                  <span>What do you call it</span>
                  <input name="label" placeholder="Birmingham, the lake streets, Oakwood Estates" required disabled={!draft} />
                </label>
                <label className="cash-bill-field">
                  <span>How big (miles across)</span>
                  <input
                    name="radiusMiles"
                    type="number"
                    min="0.25"
                    max="100"
                    step="0.25"
                    value={draft?.radiusMiles ?? 2}
                    disabled={!draft}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setDraft((current) => (current ? { ...current, radiusMiles: Number.isFinite(next) && next > 0 ? next : current.radiusMiles } : current));
                    }}
                  />
                </label>
                <label className="cash-bill-field">
                  <span>Worth driving up to</span>
                  <input name="maxDetourMiles" type="number" min="1" max="500" step="1" defaultValue={Math.max(radiusMiles * 2, radiusMiles + 5)} disabled={!draft} />
                  <small className="cash-bill-note">Miles off your route, for stops inside this area.</small>
                </label>
              </div>
              <div className="cash-bill-form-actions">
                <SaveButton className="btn primary" pendingLabel="Saving…" disabled={!draft}>Add this area</SaveButton>
                <button type="button" className="linklike" onClick={() => { setPlacing(false); setDraft(null); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn secondary" onClick={() => setPlacing(true)}>
              Add a priority area
            </button>
          )}
        </section>
      ) : null}
    </>
  );
}
