import { updateBookingAvailabilityAction } from './actions';
import { WEEKDAY_LABELS, BOOKING_WINDOW_PRESETS, TIMEZONE_OPTIONS, bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import SaveButton from '@/components/save-button';

// The Instant-booking availability form, shared by Settings → Automations and the
// Schedule page so both edit the same account columns and always mirror. Derives
// every field from the raw account row internally — callers just pass the row.
export type BookingSettingsRow = {
  timezone?: string | null;
  booking_enabled?: boolean | null;
  booking_weekdays?: string | null;
  booking_windows?: string | null;
  booking_max_per_day?: number | null;
  booking_lead_days?: number | null;
  instant_book_enabled?: boolean | null;
  instant_book_min_amount?: number | null;
  instant_book_radius_miles?: number | null;
  instant_book_geo_mode?: string | null;
  instant_book_drive_time?: boolean | null;
} | null;

export default function BookingAvailabilitySection({ bookingSettings }: { bookingSettings: BookingSettingsRow }) {
  const booking = bookingAvailabilityFromAccount(bookingSettings as Parameters<typeof bookingAvailabilityFromAccount>[0]);
  const instantBookEnabled = Boolean(bookingSettings?.instant_book_enabled);
  const instantBookMinAmount = bookingSettings?.instant_book_min_amount ? Number(bookingSettings.instant_book_min_amount) : 0;
  const instantBookRadius = bookingSettings?.instant_book_radius_miles ? Number(bookingSettings.instant_book_radius_miles) : 15;
  const instantBookGeoMode = bookingSettings?.instant_book_geo_mode === 'restrict' ? 'restrict' : 'prefer';
  const instantBookDriveTime = Boolean(bookingSettings?.instant_book_drive_time);

  return (
    <section className="panel workspace-section-card" id="booking-availability">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Instant booking</p>
        <h2>Your online booking availability</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        This controls the times customers can grab on your public <strong>Book a time</strong> page. Pick
        the days you take work, the arrival windows you offer, and how many bookings a day is enough. A
        booking still lands as a request for you to confirm &mdash; this just decides what&apos;s offered.
      </p>
      <form action={updateBookingAvailabilityAction} className="form-grid compact-form">
        <label className="checkbox-row" htmlFor="instantBookEnabled">
          <input id="instantBookEnabled" name="instantBookEnabled" type="checkbox" defaultChecked={instantBookEnabled} />
          <span>
            <strong>Only let qualified jobs book instantly.</strong> When on, the Book page asks a
            couple of quick questions for an instant AI estimate first &mdash; small, out-of-area, or
            work-you-don&apos;t-take jobs are routed to &ldquo;request a callback&rdquo; instead of grabbing a
            slot. Off = booking is open to everyone.
          </span>
        </label>
        <div className="field full">
          <label htmlFor="instantBookMinAmount">Minimum estimated job value to book instantly ($)</label>
          <input id="instantBookMinAmount" name="instantBookMinAmount" type="number" min="0" step="100" inputMode="numeric" placeholder="e.g. 500" defaultValue={instantBookMinAmount || ''} />
          <small className="field-hint">A job whose instant estimate tops out below this is sent to request-a-callback instead of taking a premium slot. Leave blank/0 for no floor. Only applies when the toggle above is on.</small>
        </div>

        <div className="field full">
          <label htmlFor="timezone">Your timezone</label>
          <select id="timezone" name="timezone" defaultValue={booking.timezone}>
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <small className="field-hint">So booking days line up with your local calendar &mdash; not the server&apos;s.</small>
        </div>

        <div className="field full">
          <label>Days you accept bookings</label>
          <div className="checkbox-grid">
            {WEEKDAY_LABELS.map((label, day) => (
              <label className="checkbox-chip" key={day}>
                <input type="checkbox" name="bookingWeekday" value={day} defaultChecked={booking.weekdays.includes(day)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <small className="field-hint">Uncheck a day to take it off the public calendar. Clear them all to pause online booking.</small>
        </div>

        <div className="field full">
          <label>Arrival windows you offer</label>
          <div className="checkbox-grid">
            {BOOKING_WINDOW_PRESETS.map((window) => (
              <label className="checkbox-chip" key={window.time}>
                <input type="checkbox" name="bookingWindow" value={window.time} defaultChecked={booking.windowTimes.includes(window.time)} />
                <span>{window.label}</span>
              </label>
            ))}
          </div>
          <small className="field-hint">Coarse on purpose &mdash; a customer picks a part of the day, and you set the exact time when you confirm.</small>
        </div>

        <div className="field">
          <label htmlFor="bookingMaxPerDay">Max bookings per day</label>
          <input id="bookingMaxPerDay" name="bookingMaxPerDay" type="number" min="1" max="50" step="1" inputMode="numeric" defaultValue={booking.maxPerDay} />
          <small className="field-hint">Once a day hits this many jobs, it stops offering slots.</small>
        </div>
        <div className="field">
          <label htmlFor="bookingLeadDays">Soonest a customer can book</label>
          <select id="bookingLeadDays" name="bookingLeadDays" defaultValue={String(booking.leadDays)}>
            <option value={0}>Same day</option>
            <option value={1}>From tomorrow</option>
            <option value={2}>2 days out</option>
            <option value={3}>3 days out</option>
            <option value={7}>A week out</option>
          </select>
          <small className="field-hint">Gives you lead time to plan your route.</small>
        </div>

        <div className="field">
          <label htmlFor="instantBookRadius">&ldquo;Nearby&rdquo; radius (miles)</label>
          <input id="instantBookRadius" name="instantBookRadius" type="number" min="1" max="100" step="1" inputMode="numeric" defaultValue={instantBookRadius} />
          <small className="field-hint">How close one of your existing jobs counts as &ldquo;we&apos;ll already be in your area&rdquo; that day.</small>
        </div>
        <div className="field">
          <label htmlFor="instantBookGeoMode">Days near your existing jobs</label>
          <select id="instantBookGeoMode" name="instantBookGeoMode" defaultValue={instantBookGeoMode}>
            <option value="prefer">Prefer &mdash; show nearby days first</option>
            <option value="restrict">Restrict &mdash; only offer nearby days</option>
          </select>
          <small className="field-hint">Restrict keeps routes tight; a customer with no nearby day is offered a callback instead. Needs your business address (below) geocoded — set it under Business &rarr; mailing address. Only applies when the gate above is on.</small>
        </div>
        <label className="checkbox-row" htmlFor="instantBookDriveTime">
          <input id="instantBookDriveTime" name="instantBookDriveTime" type="checkbox" defaultChecked={instantBookDriveTime} />
          <span>Use real <strong>driving distance &amp; time</strong> for &ldquo;nearby&rdquo; (more accurate than straight-line, and shows &ldquo;~X min away&rdquo;). Uses your Google key and needs the <em>Distance Matrix API</em> enabled &mdash; it falls back to straight-line if not.</span>
        </label>

        <div className="form-actions">
          <SaveButton>Save booking availability</SaveButton>
        </div>
      </form>
    </section>
  );
}
