'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  arrivalWindowTimes, buildArrivalMessage, estimateEtaMinutes, ETA_CHOICES, formatArrivalWindow,
  MAX_ETA_MINUTES, MIN_ETA_MINUTES, nearestEtaChoice, type ArrivalStatus, type WindowStyle,
} from '@/lib/arrival';

// The "on my way" sheet.
//
// This is the screen where somebody makes a promise to a stranger about when
// they will be at their house, so it is built around the four ways that goes
// wrong: promising a time you can't keep, promising it to the wrong customer,
// promising it twice, and not knowing whether the promise was delivered.

export type ArrivalPanelJob = {
  id: string;
  clientName: string;
  address: string | null;
  scheduleLabel: string;
  jobType: string | null;
  hasPhone: boolean;
  /** Geocoded destination, when there is one — used to suggest an ETA. */
  lat: number | null;
  lng: number | null;
};

export type ArrivalPanelTrip = {
  status: ArrivalStatus;
  windowLabel: string | null;
  sentAgoMinutes: number | null;
  smsStatus: string | null;
  shareLocation: boolean;
  sentBy: string | null;
  homeownerNote: string | null;
};

type Props = {
  job: ArrivalPanelJob;
  trip: ArrivalPanelTrip | null;
  business: string;
  crewName: string;
  template: string;
  timeZone: string;
  windowStyle: WindowStyle;
  windowMinutes: number;
  defaultMinutes: number | null;
  canShareLocation: boolean;
  shareDefaultsOn: boolean;
  canReschedule: boolean;
  canSend: boolean;
  sendAction: (formData: FormData) => Promise<void>;
  statusAction: (formData: FormData) => Promise<void>;
  /**
   * Which shell to wear. The same component serves the field app and the
   * owner's job screen deliberately — two copies of a send flow means two
   * copies of the safeguards, and the copy that rots is always the one nobody
   * is standing in a driveway using.
   */
  surface?: 'field' | 'dashboard';
};

type Geo = { lat: number; lng: number } | null;

export default function ArrivalPanel(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eta, setEta] = useState<number>(props.defaultMinutes ?? 15);
  const [custom, setCustom] = useState(false);
  const [share, setShare] = useState(props.shareDefaultsOn);
  const [geo, setGeo] = useState<Geo>(null);
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const [suggested, setSuggested] = useState<number | null>(null);
  // Whether the tech has picked an ETA themselves yet. Once they have, a GPS
  // fix landing a second later must not move it under their thumb.
  const [etaTouched, setEtaTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Ticks once a minute so the preview's clock times don't go stale while the
  // sheet sits open — a tech who opened this five minutes ago should not send a
  // window they watched expire.
  const [now, setNow] = useState(() => new Date());
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // "Live" means still changeable — the trip can be updated and the outcome
  // controls apply. An ARRIVED trip is shown (so the tech sees they logged it)
  // but offers no controls, and tapping the button again starts a fresh trip,
  // because leaving and coming back is a second visit rather than an edit.
  const live = Boolean(props.trip && (props.trip.status === 'en_route' || props.trip.status === 'delayed'));
  const showTrip = Boolean(props.trip && (live || props.trip.status === 'arrived'));
  const resend = live;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const times = useMemo(
    () => arrivalWindowTimes(now, eta, { windowStyle: props.windowStyle, windowMinutes: props.windowMinutes }),
    [now, eta, props.windowStyle, props.windowMinutes],
  );
  const windowLabel = formatArrivalWindow(times, props.timeZone);

  // The preview carries NO link: the token doesn't exist until the server mints
  // it. Saying so beneath the box is more honest than showing a fake URL.
  const preview = useMemo(
    () => buildArrivalMessage({
      template: props.template,
      business: props.business,
      crewName: props.crewName,
      customerName: props.job.clientName,
      times,
      trackingUrl: '',
      timeZone: props.timeZone,
    }).replace(/ Reply STOP to opt out\.$/, ''),
    [props.template, props.business, props.crewName, props.job.clientName, times, props.timeZone],
  );

  // Follow the template until the tech takes the pen. After that their words
  // stand, even as they change the ETA — silently rewriting what somebody typed
  // is how you send a message nobody approved.
  useEffect(() => {
    if (!edited) setMessage(preview);
  }, [preview, edited]);

  // Ask for location when the sheet OPENS, not when Send is tapped: a
  // permission prompt at the moment of sending is a permission prompt that gets
  // dismissed, and the fix (a suggested ETA) needs the answer beforehand.
  const askLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return setGeoState('denied');
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeo(here);
        setGeoState('ok');
        // Suggest, don't decide. The estimate snaps to the nearest quick-pick
        // so a GPS answer of 23 minutes lands on the "30 min" chip instead of
        // dropping them into a number field.
        const dest = jobPoint(props.job);
        const estimate = dest ? estimateEtaMinutes(here, dest) : null;
        if (estimate != null) {
          setSuggested(estimate);
          setEta((current) => (etaTouched ? current : nearestEtaChoice(estimate)));
        }
      },
      () => setGeoState('denied'),
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, [props.job, etaTouched]);

  function openSheet() {
    setOpen(true);
    setSendError(null);
    if (props.canShareLocation && geoState === 'idle') askLocation();
  }

  async function send() {
    setBusy(true);
    setSendError(null);
    const form = new FormData();
    form.set('eta', String(eta));
    if (suggested != null) form.set('suggested', String(suggested));
    if (edited) form.set('message', message);
    if (share && geo) {
      form.set('share', 'on');
      form.set('lat', String(geo.lat));
      form.set('lng', String(geo.lng));
    }
    if (resend) form.set('confirm', 'on');
    try {
      await props.sendAction(form);
      setOpen(false);
      router.refresh();
    } catch (error) {
      // A server action that never reached the server throws here. The tech is
      // about to drive somewhere on the assumption a customer was told, so this
      // says plainly that nothing was sent and keeps what they typed.
      const redirected = error instanceof Error && error.message.includes('NEXT_REDIRECT');
      if (redirected) {
        setOpen(false);
        router.refresh();
      } else {
        setSendError("Couldn't reach the server — nothing was sent. Check your signal and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const dashboard = props.surface === 'dashboard';
  const sectionClass = dashboard ? 'panel workspace-section-card' : 'field-block';
  const titleClass = dashboard ? 'arrival-card-title' : 'field-block-title';

  if (!props.canSend) {
    return (
      <section className={sectionClass}>
        <h2 className={titleClass}>Heading over?</h2>
        <p className="field-empty">Your manager hasn&rsquo;t given you permission to send arrival updates on this account.</p>
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <h2 className={titleClass}>{live ? 'This visit' : dashboard ? 'On my way' : 'Heading over?'}</h2>

      {showTrip && props.trip ? <LiveTrip trip={props.trip} /> : null}

      {!open ? (
        <div className="field-actions-row">
          <button type="button" className="btn primary" onClick={openSheet}>
            {live ? '🕑 Send an updated time' : "📍 I'm on my way"}
          </button>
        </div>
      ) : (
        <div className="arrival-sheet">
          {/* Wrong-job protection. Whoever is about to be texted is named first,
              in full, before any control the tech can press. */}
          <div className="arrival-confirm">
            <p className="arrival-confirm-label">You&rsquo;re texting</p>
            <strong>{props.job.clientName}</strong>
            {props.job.address ? <span>{props.job.address}</span> : <span className="arrival-warn">No address on this job</span>}
            <span>{props.job.scheduleLabel}{props.job.jobType ? ` · ${props.job.jobType}` : ''}</span>
          </div>

          {!props.job.hasPhone ? (
            <p className="arrival-warn-box">
              There&rsquo;s no phone number on this job, so no text can go out. You can still start the visit —
              the timeline will record it.
            </p>
          ) : null}

          {resend ? (
            <p className="arrival-warn-box">
              An &ldquo;on my way&rdquo; already went out{props.trip?.sentAgoMinutes != null ? ` ${props.trip.sentAgoMinutes} min ago` : ''}.
              This sends an <strong>updated time</strong> to the same link — they won&rsquo;t get a second one.
            </p>
          ) : null}

          <p className="arrival-field-label">
            How far out are you?
            {suggested != null ? <span className="arrival-suggested"> · about {suggested} min by GPS</span> : null}
          </p>
          <div className="arrival-eta-grid">
            {ETA_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`arrival-eta${!custom && eta === choice ? ' is-on' : ''}`}
                onClick={() => { setCustom(false); setEtaTouched(true); setEta(choice); }}
              >
                {choice} min
              </button>
            ))}
            <button
              type="button"
              className={`arrival-eta${custom ? ' is-on' : ''}`}
              onClick={() => { setCustom(true); setEtaTouched(true); }}
            >
              Custom
            </button>
          </div>

          {custom ? (
            <label className="arrival-custom">
              <span>Minutes from now</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_ETA_MINUTES}
                max={MAX_ETA_MINUTES}
                value={eta}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setEta(Math.min(MAX_ETA_MINUTES, Math.max(MIN_ETA_MINUTES, Math.round(next))));
                }}
              />
            </label>
          ) : null}

          <p className="arrival-window">
            They&rsquo;ll be told: <strong>{windowLabel}</strong>
            {props.windowStyle === 'window' ? <span> (a {props.windowMinutes}-minute window)</span> : null}
          </p>

          {props.canShareLocation ? (
            <label className="field-share arrival-share">
              <input
                type="checkbox"
                checked={share && geoState === 'ok'}
                disabled={geoState !== 'ok'}
                onChange={(event) => setShare(event.target.checked)}
              />
              <span>
                {geoState === 'ok' ? 'Show my location on their status page' : null}
                {geoState === 'asking' ? 'Getting your location…' : null}
                {geoState === 'denied' ? 'Location is off — your ETA above still sends.' : null}
                {geoState === 'idle' ? 'Location not requested' : null}
              </span>
            </label>
          ) : null}
          {geoState === 'denied' ? (
            <button type="button" className="arrival-link-btn" onClick={askLocation}>Try location again</button>
          ) : null}

          <p className="arrival-field-label">Message</p>
          <textarea
            ref={messageRef}
            className="arrival-message"
            rows={4}
            value={message}
            onChange={(event) => { setEdited(true); setMessage(event.target.value); }}
          />
          <p className="arrival-hint">
            {resend
              ? 'They already have the tracking link, so this update won’t repeat it.'
              : 'The tracking link is added automatically.'}{' '}
            &ldquo;Reply STOP to opt out&rdquo; is always added.
            {edited ? <> <button type="button" className="arrival-link-btn" onClick={() => setEdited(false)}>Reset to default</button></> : null}
          </p>

          {sendError ? <p className="arrival-error">{sendError}</p> : null}

          <div className="field-actions-row arrival-actions">
            <button type="button" className="btn primary" onClick={send} disabled={busy}>
              {busy ? 'Sending…' : resend ? 'Send updated time' : `Send — ${windowLabel}`}
            </button>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {live ? (
        <ArrivalControls statusAction={props.statusAction} canReschedule={props.canReschedule} />
      ) : null}
    </section>
  );
}

// The live trip's own summary: what was promised, whether the customer was
// actually reached, and anything they've said back.
function LiveTrip({ trip }: { trip: ArrivalPanelTrip }) {
  const delivery = deliveryNote(trip.smsStatus);
  return (
    <div className="arrival-live">
      <div className="arrival-live-top">
        <span className={`arrival-pill${trip.status === 'delayed' ? ' is-late' : ''}${trip.status === 'arrived' ? ' is-done' : ''}`}>
          {trip.status === 'delayed' ? 'Running late' : trip.status === 'arrived' ? 'Arrived' : 'On the way'}
        </span>
        {trip.status === 'arrived'
          ? <strong>You logged this arrival</strong>
          : <strong>{trip.windowLabel ?? 'No time promised'}</strong>}
      </div>
      {delivery ? <p className={`arrival-delivery${delivery.bad ? ' is-bad' : ''}`}>{delivery.text}</p> : null}
      {trip.shareLocation ? <p className="arrival-delivery">📍 Your location is on their page until you arrive.</p> : null}
      {trip.homeownerNote ? <p className="arrival-note">💬 {trip.homeownerNote}</p> : null}
    </div>
  );
}

function jobPoint(job: ArrivalPanelJob): { lat: number; lng: number } | null {
  return typeof job.lat === 'number' && typeof job.lng === 'number' ? { lat: job.lat, lng: job.lng } : null;
}

function deliveryNote(status: string | null): { text: string; bad: boolean } | null {
  switch (status) {
    case 'sent': return { text: '✓ The customer was texted.', bad: false };
    case 'failed': return { text: '⚠ The text did NOT send. They have not been told.', bad: true };
    case 'opted_out': return { text: '⚠ Not texted — this number opted out of messages.', bad: true };
    case 'no_phone': return { text: '⚠ Not texted — no usable phone number on this job.', bad: true };
    case 'not_configured': return { text: '⚠ Not texted — texting isn’t set up on this account.', bad: true };
    default: return null;
  }
}

// How the visit ended. Everything except Arrived asks for a reason, because a
// job that closes as "no access" with no note is a job the office has to phone
// somebody about.
function ArrivalControls({ statusAction, canReschedule }: { statusAction: (formData: FormData) => Promise<void>; canReschedule: boolean }) {
  const [pick, setPick] = useState<'no_access' | 'rescheduled' | 'cancelled' | null>(null);

  return (
    <div className="arrival-controls">
      <form action={statusAction}>
        <input type="hidden" name="status" value="arrived" />
        <button type="submit" className="btn primary">✓ I&rsquo;ve arrived</button>
      </form>

      <div className="arrival-secondary">
        <button type="button" className="arrival-outcome" onClick={() => setPick(pick === 'no_access' ? null : 'no_access')}>
          Can&rsquo;t access property
        </button>
        {canReschedule ? (
          <button type="button" className="arrival-outcome" onClick={() => setPick(pick === 'rescheduled' ? null : 'rescheduled')}>
            Reschedule
          </button>
        ) : null}
        <button type="button" className="arrival-outcome" onClick={() => setPick(pick === 'cancelled' ? null : 'cancelled')}>
          Cancel visit
        </button>
      </div>

      {pick ? (
        <form action={statusAction} className="arrival-outcome-form">
          <input type="hidden" name="status" value={pick} />
          <input name="note" placeholder={pick === 'no_access' ? 'e.g. Gate locked, nobody home' : 'Reason (optional)'} />
          <label className="field-share">
            <input type="checkbox" name="notify" defaultChecked />
            <span>Text the customer to let them know</span>
          </label>
          <button type="submit" className="btn secondary">
            {pick === 'no_access' ? 'Log no access' : pick === 'rescheduled' ? 'Mark rescheduled' : 'Cancel this visit'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
