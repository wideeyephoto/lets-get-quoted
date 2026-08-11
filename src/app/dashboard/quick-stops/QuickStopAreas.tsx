import SaveButton from '@/components/save-button';
import type { PriorityZone } from '@/lib/quick-stop-zones';
import {
  addQuickStopAreaAction,
  deleteQuickStopZoneAction,
  updateQuickStopAreaDetourAction,
} from './actions';

// Places worth a longer drive.
//
// ON SETTINGS, NOT ON TODAY. This is an editable list with three server actions
// behind it, and what it decides — where you would be willing to drive further
// than usual — is a standing preference, not a fact about this morning. It sat
// under the coverage map on the Today tab, which is how Today came to be four
// thousand pixels of operations, marketing and a form. `quick-stop-areas` was
// already on QUICK_STOP_SETTINGS_ANCHORS, so the deep links have been pointing
// here the whole time.
//
// Areas are TYPED, not drawn. The previous version asked the owner to tap a
// center on the map and then set a radius — which is asking somebody to express
// "Birmingham" as a pin and a number, when Birmingham is a thing they already
// know the name of. Now they type a city or a ZIP and the place's own boundary
// supplies the circle (see geocodeArea).
//
// A server component: there is no conversation between the map and the form, so
// nothing here needs state.

type Props = {
  /** The everyday limit these areas are an exception to. */
  radiusMiles: number;
  zones: PriorityZone[];
  zonesAvailable: boolean;
};

export default function QuickStopAreas({ radiusMiles, zones, zonesAvailable }: Props) {
  if (!zonesAvailable) return null;

  // A sensible default for a new area: comfortably further than the everyday
  // limit, since going further is the entire point of adding one.
  const suggestedDetour = Math.max(radiusMiles * 2, radiusMiles + 5);

  return (
    <section className="panel workspace-section-card qs-zones" id="quick-stop-areas">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Priority areas</p>
        <h2>Places worth a longer drive</h2>
      </div>

      <p className="cash-bills-lead">
        {/* Said plainly, because the alternative version of this feature — one
            that picks the areas FOR them out of income data — is the one people
            expect, and it is not what this is. */}
        Your detour limit is {radiusMiles} miles everywhere by default. Add a city or ZIP code here and
        Quick Stops inside it are worth going further for. You choose the places and why — a town you
        already own, a suburb you&rsquo;re trying to grow into.
      </p>

      {zones.length > 0 ? (
        <ul className="cash-bill-list qs-area-list">
          {zones.map((zone) => (
            <li key={zone.id} className="cash-bill">
              <div className="cash-bill-main">
                <strong>{zone.label}</strong>
                <small>
                  {/* The radius is shown but not editable: it came from the
                      place's own boundary, and a number the owner never typed is
                      not one they should have to maintain. What they DO decide —
                      how far it is worth driving — is the field beside it.

                      "about 1.6 miles out from the middle" left three readings
                      open — a radius, the area's boundary, or how far you would
                      drive — and the field directly beside it is a DRIVING
                      distance, which is the reading it most invited and the only
                      wrong one. Named as a radius, in those words, with what it
                      is measured from. */}
                  covers a {zone.radiusMiles}-mile radius around the center of {zone.label}
                </small>
              </div>
              <div className="cash-bill-actions qs-area-actions">
                <form action={updateQuickStopAreaDetourAction.bind(null, zone.id)} className="qs-area-detour">
                  <label>
                    <span>Worth driving up to</span>
                    <input
                      name="maxDetourMiles"
                      type="number"
                      min="1"
                      max="500"
                      step="1"
                      defaultValue={zone.maxDetourMiles}
                      aria-label={`Miles worth driving for ${zone.label}`}
                    />
                    <span>miles</span>
                  </label>
                  <SaveButton className="linklike" pendingLabel="Saving…" onlyWhenChanged>
                    Save
                  </SaveButton>
                </form>
                <form action={deleteQuickStopZoneAction.bind(null, zone.id)}>
                  <button type="submit" className="linklike danger">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={addQuickStopAreaAction} className="cash-bill-form qs-area-form">
        <div className="cash-bill-form-grid">
          <label className="cash-bill-field wide">
            <span>City or ZIP code</span>
            <input
              name="place"
              placeholder="Birmingham, Royal Oak, 48009…"
              autoComplete="off"
              required
            />
            <small className="cash-bill-note">
              US cities, towns and ZIP codes. We work out how big the area is from the place itself.
            </small>
          </label>
          <label className="cash-bill-field">
            <span>Worth driving up to</span>
            <input name="maxDetourMiles" type="number" min="1" max="500" step="1" defaultValue={suggestedDetour} />
            <small className="cash-bill-note">Miles off your route, for stops inside it.</small>
          </label>
        </div>
        <div className="cash-bill-form-actions">
          <SaveButton className="btn primary" pendingLabel="Adding…">Add area</SaveButton>
        </div>
      </form>
    </section>
  );
}
