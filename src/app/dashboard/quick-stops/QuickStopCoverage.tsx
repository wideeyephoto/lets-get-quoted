'use client';

import { useState } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
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
  /** Where to open the map when nothing is booked — see QuickStopCoverageMap. */
  fallbackCenter?: { lat: number; lng: number } | null;
};

type Draft = { lat: number; lng: number; radiusMiles: number };

export default function QuickStopCoverage({ stops, radiusMiles, emptyReason, zones, zonesAvailable, fallbackCenter = null }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [placing, setPlacing] = useState(false);
  // The name, held here rather than left uncontrolled, so choosing a place in
  // the search can fill it in and the owner can still overwrite it.
  const [placeLabel, setPlaceLabel] = useState('');

  function pickCenter(point: { lat: number; lng: number }) {
    if (!placing) return;
    setDraft((current) => ({ lat: point.lat, lng: point.lng, radiusMiles: current?.radiusMiles ?? 2 }));
  }

  function stopPlacing() {
    setPlacing(false);
    setDraft(null);
    setPlaceLabel('');
  }

  return (
    <>
      <QuickStopCoverageMap
        stops={stops}
        radiusMiles={radiusMiles}
        emptyReason={emptyReason}
        zones={zones}
        draft={draft}
        fallbackCenter={fallbackCenter}
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
                      {/* "across" was wrong, and not harmlessly. This number is
                          used as a RADIUS everywhere that matters — zoneContains
                          compares it against the distance from the middle, and
                          the map draws it as the circle's radius — so an owner
                          who read "2 miles across" and typed 2 got an area four
                          miles wide, covering four times the ground they meant
                          to grant a longer drive to. The wording is what was
                          wrong here, not the maths: changing the maths would
                          silently halve every area already saved. */}
                      {zone.radiusMiles} mile{zone.radiusMiles === 1 ? '' : 's'} out from the middle · worth driving up to{' '}
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
                {draft ? 'Name this area' : 'Find the area, or tap it on the map above'}
              </p>

              {/* Two ways in, because "tap the map" alone assumed the owner
                  could already see the place they had in mind. Searching gets
                  them there by name — which is how somebody actually thinks
                  about a subdivision — and the map still accepts a tap for the
                  areas that have no name worth typing. */}
              <label className="cash-bill-field wide qs-zone-search">
                <span>Search for it</span>
                <AddressAutocomplete
                  name="zoneSearch"
                  mode="place"
                  placeholder="A suburb, a subdivision, a street…"
                  bias={fallbackCenter}
                  onPlaceSelected={(place) => {
                    if (place.lat === null || place.lng === null) return;
                    setPlaceLabel(place.name || place.address);
                    setDraft((current) => ({
                      lat: place.lat as number,
                      lng: place.lng as number,
                      radiusMiles: current?.radiusMiles ?? 2,
                    }));
                  }}
                />
                <small className="cash-bill-note">
                  {draft
                    ? 'Centre set — drag the pin on the map to fine-tune it.'
                    : 'Picking a place drops the pin there. You can still tap the map instead.'}
                </small>
              </label>

              <input type="hidden" name="centerLat" value={draft?.lat ?? ''} />
              <input type="hidden" name="centerLng" value={draft?.lng ?? ''} />
              <div className="cash-bill-form-grid">
                <label className="cash-bill-field wide">
                  <span>What do you call it</span>
                  {/* Pre-filled from the search, because the place somebody just
                      picked is almost always what they would have typed here. */}
                  <input
                    name="label"
                    placeholder="Birmingham, the lake streets, Oakwood Estates"
                    required
                    disabled={!draft}
                    value={placeLabel}
                    onChange={(event) => setPlaceLabel(event.target.value)}
                  />
                </label>
                <label className="cash-bill-field">
                  {/* Radius, said as a radius — see the note on the list above. */}
                  <span>How big (miles out from the middle)</span>
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
                <button type="button" className="linklike" onClick={stopPlacing}>Cancel</button>
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
