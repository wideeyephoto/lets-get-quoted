'use client';

import { useEffect, useRef, useState } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import SaveButton from '@/components/save-button';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import { KIND_GLYPH, KIND_LABEL, ROUTE_STOP_KINDS, type SavedPlace } from '@/lib/route-stops';
import { addRouteStopAction } from './actions';

// Adding the stops a day actually contains but a job list never held: the dump
// run on the way back, the Home Depot trip before the first job, fuel.
//
// The second time is the point. Every stop with an address is remembered, so the
// list below the form is this contractor's own places ordered by how often they
// go — one tap fills the whole form, coordinates included, and no geocode is
// billed to learn what we were told last time.

export default function AddRouteStop({
  dateKey,
  crewId,
  savedPlaces,
  stopCount,
  prefill,
  onPrefillUsed,
}: {
  dateKey: string;
  crewId: string | null;
  savedPlaces: SavedPlace[];
  // How many supply stops the day currently has. The server action doesn't
  // redirect (that would hand Next's router cache a stale page), so this is how
  // the form learns its submission actually landed.
  stopCount: number;
  // A store picked off the map. Same path as a saved place: name, address and
  // coordinates all arrive together, so nothing is typed and nothing is geocoded.
  prefill: { label: string; address: string; lat: number; lng: number } | null;
  onPrefillUsed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>('supply');
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(20);
  // Set only when a saved place was used, so the action can skip geocoding.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);
  const lastCount = useRef(stopCount);

  useEffect(() => {
    if (stopCount <= lastCount.current) {
      lastCount.current = stopCount;
      return;
    }
    lastCount.current = stopCount;
    // The stop is on the day now; leaving its details in the form invites the
    // same stop being added twice.
    setOpen(false);
    setLabel('');
    setKind('supply');
    setMinutes(20);
    setCoords(null);
    if (addressRef.current) addressRef.current.value = '';
  }, [stopCount]);

  function fill(place: { label: string; address: string; lat: number | null; lng: number | null; kind?: string; minutes?: number }) {
    setLabel(place.label);
    if (place.kind) setKind(place.kind);
    if (place.minutes) setMinutes(place.minutes);
    setCoords(place.lat != null && place.lng != null ? { lat: Number(place.lat), lng: Number(place.lng) } : null);
    if (addressRef.current) {
      addressRef.current.value = place.address;
      // React doesn't own this input's value (it's an uncontrolled autocomplete),
      // so nudge it to make sure anything listening sees the change.
      addressRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setOpen(true);
  }

  function applySavedPlace(place: SavedPlace) {
    fill({ ...place, kind: place.kind, minutes: place.default_minutes });
  }

  // A store clicked on the map. The address field is uncontrolled, so this has to
  // run after the form is mounted — hence an effect rather than a direct call.
  useEffect(() => {
    if (!prefill) return;
    fill({ ...prefill, kind: 'supply' });
    onPrefillUsed();
    // fill/onPrefillUsed are stable enough for this one-shot handoff; re-running
    // on every render would re-open a form the contractor just cancelled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  if (!open) {
    return (
      <div className="plan-addstop-collapsed">
        <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
          + Add a stop
        </button>
        {savedPlaces.length > 0 ? (
          <div className="plan-place-chips">
            <span className="plan-place-chips-label">Quick add</span>
            {savedPlaces.slice(0, 5).map((place) => (
              <button key={place.id} type="button" className="plan-place-chip" onClick={() => applySavedPlace(place)}>
                <ServiceIcon name={KIND_GLYPH[place.kind]} />
                {place.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form action={addRouteStopAction} className="plan-addstop">
      <input type="hidden" name="dateKey" value={dateKey} />
      <input type="hidden" name="crewId" value={crewId ?? ''} />
      {coords ? (
        <>
          <input type="hidden" name="lat" value={coords.lat} />
          <input type="hidden" name="lng" value={coords.lng} />
        </>
      ) : null}

      <div className="plan-addstop-head">
        <strong>Add a stop to this day</strong>
        <button type="button" className="linklike" onClick={() => setOpen(false)}>Cancel</button>
      </div>

      {savedPlaces.length > 0 ? (
        <div className="plan-place-chips">
          <span className="plan-place-chips-label">Places you go</span>
          {savedPlaces.map((place) => (
            <button key={place.id} type="button" className="plan-place-chip" onClick={() => applySavedPlace(place)}>
              <ServiceIcon name={KIND_GLYPH[place.kind]} />
              {place.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="plan-addstop-grid">
        <div className="field">
          <label htmlFor="stopLabel">Name</label>
          <input
            id="stopLabel"
            name="label"
            required
            maxLength={120}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Home Depot — Rochester Rd"
          />
        </div>
        <div className="field">
          <label htmlFor="stopKind">Type</label>
          <select id="stopKind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            {ROUTE_STOP_KINDS.map((option) => (
              <option key={option} value={option}>{KIND_LABEL[option]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="stopMinutes">How long</label>
          <select id="stopMinutes" name="minutes" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
            {[10, 15, 20, 30, 45, 60, 90].map((option) => (
              <option key={option} value={option}>{option} min</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="stopAddress">Address</label>
        {/* Verified as you type: an address the geocoder can't place can't be
            routed, and a stop that silently drops out of the day it was just
            added to is worse than no stop at all. */}
        <AddressAutocomplete
          inputRef={addressRef}
          id="stopAddress"
          name="address"
          placeholder="Start typing the address"
          onValueChange={() => setCoords(null)}
        />
      </div>

      <div className="field">
        <label htmlFor="stopTime">Time (optional)</label>
        <input id="stopTime" name="scheduledTime" type="time" />
        <small className="field-hint">Leave blank and we&apos;ll fit it into the route for you.</small>
      </div>

      <div className="form-actions">
        <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">Add stop</SaveButton>
      </div>
    </form>
  );
}
