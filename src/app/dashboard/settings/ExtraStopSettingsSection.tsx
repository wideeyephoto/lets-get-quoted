import { updateExtraStopSettingsAction } from './actions';
import { WEEKDAY_LABELS } from '@/lib/booking-availability';
import { extraStopSettingsFromAccount, centsToDollars } from '@/lib/extra-stop';
import SaveButton from '@/components/save-button';

// The Extra Stop config form. Sits directly below Instant booking in Settings →
// Automations. Derives every field from the raw account row internally (mirrors
// BookingAvailabilitySection) so the caller just passes the row. Fees are stored
// in cents; shown/entered here in dollars and converted in the action.
export type ExtraStopSettingsRow = Parameters<typeof extraStopSettingsFromAccount>[0];

export default function ExtraStopSettingsSection({ extraStop }: { extraStop: ExtraStopSettingsRow }) {
  const s = extraStopSettingsFromAccount(extraStop);

  return (
    <section className="panel workspace-section-card" id="extra-stop">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Extra Stop</p>
        <h2>Same-day &ldquo;add me to your route&rdquo; requests</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Extra Stop is a separate, faster path that runs alongside normal booking. A customer asks to be
        squeezed onto the end of your route today; you review the job, propose an arrival window, and set a
        one-off Extra Stop fee. They pay only after approving the time and price &mdash; nothing is booked
        until payment clears. It uses its own daily limit and skips your normal minimum job value and
        soonest-booking rules.
      </p>
      <form action={updateExtraStopSettingsAction} className="form-grid compact-form">
        <label className="checkbox-row" htmlFor="extraStopEnabled">
          <input id="extraStopEnabled" name="extraStopEnabled" type="checkbox" defaultChecked={s.enabled} />
          <span>
            <strong>Offer Extra Stop on my Book page.</strong> When on, qualifying same-day jobs can request
            an Extra Stop after the AI intake. Off = only standard booking is offered.
          </span>
        </label>

        <div className="field full">
          <label>Days you accept Extra Stops</label>
          <div className="checkbox-grid">
            {WEEKDAY_LABELS.map((label, day) => (
              <label className="checkbox-chip" key={day}>
                <input type="checkbox" name="extraStopWeekday" value={day} defaultChecked={s.weekdays.includes(day)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <small className="field-hint">Extra Stops are only offered on these days. Clear them all to pause Extra Stop.</small>
        </div>

        <div className="field">
          <label htmlFor="extraStopEarliest">Earliest arrival time</label>
          <input id="extraStopEarliest" name="extraStopEarliest" type="time" defaultValue={s.earliestTime} />
          <small className="field-hint">The earliest an arrival window may start.</small>
        </div>
        <div className="field">
          <label htmlFor="extraStopLatestEnd">Latest arrival-window end</label>
          <input id="extraStopLatestEnd" name="extraStopLatestEnd" type="time" defaultValue={s.latestEnd} />
          <small className="field-hint">The latest an arrival window may end.</small>
        </div>

        <div className="field">
          <label htmlFor="extraStopMaxPerDay">Max Extra Stops per day</label>
          <input id="extraStopMaxPerDay" name="extraStopMaxPerDay" type="number" min="1" max="50" step="1" inputMode="numeric" defaultValue={s.maxPerDay} />
          <small className="field-hint">Separate from your normal booking limit &mdash; these don&apos;t count against it.</small>
        </div>
        <div className="field">
          <label htmlFor="extraStopMaxVisitMinutes">Max visit duration (minutes)</label>
          <input id="extraStopMaxVisitMinutes" name="extraStopMaxVisitMinutes" type="number" min="5" max="600" step="5" inputMode="numeric" defaultValue={s.maxVisitMinutes} />
          <small className="field-hint">Jobs the AI estimates will take longer than this are excluded from Extra Stop.</small>
        </div>

        <div className="field">
          <label htmlFor="extraStopMaxDetourMiles">Max route detour (miles)</label>
          <input id="extraStopMaxDetourMiles" name="extraStopMaxDetourMiles" type="number" min="0" max="500" step="1" inputMode="numeric" defaultValue={s.maxDetourMiles} />
          <small className="field-hint">How far off your last stop&apos;s route you&apos;ll go for an Extra Stop.</small>
        </div>
        <div className="field">
          <label htmlFor="extraStopMaxDetourMinutes">Max route detour (minutes)</label>
          <input id="extraStopMaxDetourMinutes" name="extraStopMaxDetourMinutes" type="number" min="0" max="600" step="5" inputMode="numeric" defaultValue={s.maxDetourMinutes} />
          <small className="field-hint">Added drive time you&apos;ll accept to reach the stop.</small>
        </div>

        <div className="field">
          <label htmlFor="extraStopMinFee">Minimum Extra Stop fee ($)</label>
          <input id="extraStopMinFee" name="extraStopMinFee" type="number" min="0" step="5" inputMode="decimal" defaultValue={centsToDollars(s.minFeeCents)} />
          <small className="field-hint">The floor for the fee you set on each request.</small>
        </div>
        <div className="field">
          <label htmlFor="extraStopMaxFee">Maximum Extra Stop fee ($)</label>
          <input id="extraStopMaxFee" name="extraStopMaxFee" type="number" min="0" step="5" inputMode="decimal" defaultValue={centsToDollars(s.maxFeeCents)} />
          <small className="field-hint">The ceiling. You still set the exact fee per request within this range.</small>
        </div>

        <label className="checkbox-row" htmlFor="extraStopAllowAfterCapacity">
          <input id="extraStopAllowAfterCapacity" name="extraStopAllowAfterCapacity" type="checkbox" defaultChecked={s.allowAfterCapacity} />
          <span>Allow Extra Stops even after my normal daily booking capacity is reached (that&apos;s the point &mdash; a paid squeeze-in when the day is otherwise full).</span>
        </label>

        <div className="field">
          <label htmlFor="extraStopResponseDeadline">Your response deadline (minutes)</label>
          <input id="extraStopResponseDeadline" name="extraStopResponseDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.responseDeadlineMins} />
          <small className="field-hint">How long you have to make an offer before a request expires. Default 30.</small>
        </div>
        <div className="field">
          <label htmlFor="extraStopPaymentDeadline">Customer payment deadline (minutes)</label>
          <input id="extraStopPaymentDeadline" name="extraStopPaymentDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.paymentDeadlineMins} />
          <small className="field-hint">How long the customer has to pay and lock the window. Default 15.</small>
        </div>

        <div className="field full">
          <label htmlFor="extraStopCategories">Allowed service categories</label>
          <input id="extraStopCategories" name="extraStopCategories" defaultValue={s.categories.join(', ')} placeholder="e.g. leak repair, faucet swap, unclog, minor electrical" />
          <small className="field-hint">Comma-separated. Extra Stop is only offered for these kinds of quick jobs. Leave blank to allow any category the AI clears.</small>
        </div>

        <div className="field">
          <label htmlFor="extraStopRequiredPhotos">Required photos</label>
          <input id="extraStopRequiredPhotos" name="extraStopRequiredPhotos" type="number" min="0" max="6" step="1" inputMode="numeric" defaultValue={s.requiredPhotos} />
          <small className="field-hint">Photos the customer must attach before requesting. 0 = optional.</small>
        </div>
        <label className="checkbox-row" htmlFor="extraStopRequireAiApproval">
          <input id="extraStopRequireAiApproval" name="extraStopRequireAiApproval" type="checkbox" defaultChecked={s.requireAiApproval} />
          <span>Require the AI eligibility check to pass before Extra Stop is offered (recommended &mdash; keeps out complex, unsafe, or out-of-scope jobs).</span>
        </label>

        <div className="form-actions">
          <SaveButton>Save Extra Stop settings</SaveButton>
        </div>
      </form>
    </section>
  );
}
