// Arrival management — the rules behind "On my way".
//
// Everything here is pure so it can be tested without a database and reused on
// both sides of the wire: the field app renders the preview from these functions
// and the server re-derives the message from the same ones. The tech edits words,
// never the link and never the promise — see buildArrivalMessage.

export type ArrivalStatus =
  | 'en_route'
  | 'delayed'
  | 'arrived'
  | 'no_access'
  | 'rescheduled'
  | 'cancelled'
  | 'done';

export type LocationPolicy = 'ask' | 'on' | 'off';
export type LocationPrecision = 'exact' | 'street';
export type WindowStyle = 'exact' | 'window';

/** Delivery outcome of the customer text. "Sent" is a claim; this is the receipt. */
export type SmsStatus = 'sent' | 'failed' | 'no_phone' | 'opted_out' | 'not_configured';

// The quick picks, straight from a tech's mental model of "how far out am I".
export const ETA_CHOICES = [5, 10, 15, 30, 45, 60] as const;

/** A custom arrival time may be entered, but not an absurd one. */
export const MIN_ETA_MINUTES = 1;
export const MAX_ETA_MINUTES = 480;

/** Bounds on the customer-facing window width, and on how long a link lives. */
export const MIN_WINDOW_MINUTES = 0;
export const MAX_WINDOW_MINUTES = 120;
export const MIN_LINK_HOURS = 1;
export const MAX_LINK_HOURS = 24;

// A location share ends when the trip ends. This is the backstop for the trip
// that never formally ends because the tech got busy and never tapped Arrived.
export const LOCATION_SHARE_MINUTES = 90;

export const DEFAULT_WINDOW_MINUTES = 30;
export const DEFAULT_LINK_HOURS = 12;

/**
 * The only arrival-window widths a contractor can pick.
 *
 * Was a free numeric input from 0 to 120. Nobody has an opinion about 35
 * minutes, and a 0 was allowed — which is an exact time promised as a window,
 * the one thing this feature exists to avoid.
 */
export const ARRIVAL_WINDOW_CHOICES = [30, 45, 60, 90] as const;

/**
 * Settings that are FIXED rather than configurable, and why each one is.
 *
 * A control is worth showing when there is a real decision behind it. These had
 * controls and no decision: every one of them has an answer that is right for
 * essentially every contractor, and the wrong answer is quietly harmful.
 *
 * The columns behind them are deliberately kept — see the note on
 * arrivalSettingsFromAccount. Any of these could become a per-account choice
 * later, and none of them should need a migration when it does.
 */
/** A single promised minute is a promise that gets broken. Always a window. */
export const ARRIVAL_MODE: WindowStyle = 'window';
/** Answers "are they close?" without answering "are they outside number 42?". */
export const MAP_PRECISION: LocationPrecision = 'street';
/** Long enough to cover a visit and a callback; short enough to expire. */
export const TRACKING_LINK_HOURS = 4;

/** Snap a stored width to the nearest offered choice. */
export function nearestWindowChoice(minutes: number): number {
  return ARRIVAL_WINDOW_CHOICES.reduce((best, choice) =>
    Math.abs(choice - minutes) < Math.abs(best - minutes) ? choice : best,
  );
}

export type ArrivalSettings = {
  /** The master switch. Off means the crew's tap sends nothing. */
  enabled: boolean;
  locationPolicy: LocationPolicy;
  locationPrecision: LocationPrecision;
  windowStyle: WindowStyle;
  windowMinutes: number;
  defaultMinutes: number | null;
  messageTemplate: string | null;
  linkHours: number;
  timeZone: string;
};

export const DEFAULT_ARRIVAL_SETTINGS: ArrivalSettings = {
  enabled: true,
  locationPolicy: 'ask',
  locationPrecision: MAP_PRECISION,
  windowStyle: ARRIVAL_MODE,
  windowMinutes: DEFAULT_WINDOW_MINUTES,
  defaultMinutes: null,
  messageTemplate: null,
  linkHours: TRACKING_LINK_HOURS,
  timeZone: 'America/New_York',
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Read the account row into settings, defensively. An un-migrated database is
 * missing every one of these columns, and the correct behaviour there is the
 * documented default — not a crash on the one screen a tech opens while
 * standing in a driveway.
 *
 * THE FIXED VALUES ARE APPLIED HERE, not at each send site. This is the single
 * place an account row becomes settings, so forcing them here means every
 * consumer — the field panel, the send path, the sweep, the preview — agrees by
 * construction rather than by four people remembering the same rule.
 *
 * arrival_window_style, arrival_location_precision, arrival_link_hours and
 * arrival_message_template are no longer read. The columns stay because any of
 * them could become a per-account choice again, and none should need a
 * migration when it does — but nothing may quietly depend on a value the
 * interface no longer shows, so they are ignored rather than half-honoured.
 */
export function arrivalSettingsFromAccount(row: Record<string, unknown> | null | undefined): ArrivalSettings {
  if (!row) return { ...DEFAULT_ARRIVAL_SETTINGS };
  const rawDefault = row.arrival_default_minutes;
  return {
    // Absent column (un-migrated) means on: the feature works today and a
    // missing switch must not read as "switched off".
    enabled: row.arrival_updates_enabled === undefined || row.arrival_updates_enabled === null
      ? true
      : row.arrival_updates_enabled !== false,
    // Still read, still honoured, no longer shown — the crew's per-visit
    // location prompt is unchanged.
    locationPolicy: oneOf(row.arrival_location_policy, ['ask', 'on', 'off'] as const, 'ask'),
    locationPrecision: MAP_PRECISION,
    windowStyle: ARRIVAL_MODE,
    // Snapped to an offered choice. A stored 20 or 35 from the old free-text
    // field would otherwise leave the settings page highlighting one number
    // while the customer is told a different one.
    windowMinutes: nearestWindowChoice(
      clampInt(row.arrival_window_minutes, MIN_WINDOW_MINUTES, MAX_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES),
    ),
    defaultMinutes:
      rawDefault === null || rawDefault === undefined || !Number.isFinite(Number(rawDefault))
        ? null
        : clampInt(rawDefault, MIN_ETA_MINUTES, MAX_ETA_MINUTES, 15),
    messageTemplate: null,
    linkHours: TRACKING_LINK_HOURS,
    timeZone: typeof row.timezone === 'string' && row.timezone ? row.timezone : 'America/New_York',
  };
}

// -- Permissions --------------------------------------------------------------

export type ArrivalPermissions = {
  send: boolean;
  shareLocation: boolean;
  viewContact: boolean;
  reschedule: boolean;
};

/**
 * Crew capabilities. Absent columns read as the pre-permission behaviour, so a
 * database that hasn't taken the migration keeps working exactly as it did —
 * except for rescheduling, which is new and therefore off until granted.
 */
export function arrivalPermissionsFromCrew(row: Record<string, unknown> | null | undefined): ArrivalPermissions {
  const allow = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    send: allow(row?.can_send_arrival, true),
    shareLocation: allow(row?.can_share_location, true),
    viewContact: allow(row?.can_view_client_contact, true),
    reschedule: allow(row?.can_reschedule, false),
  };
}

/**
 * Whether this tech may attach their position to this trip. Both the employer's
 * policy and the person's own permission have to allow it — an owner who set
 * the policy to 'on' still can't override a crew member whose location
 * permission was revoked.
 */
export function canShareLocation(settings: ArrivalSettings, permissions: ArrivalPermissions): boolean {
  return settings.locationPolicy !== 'off' && permissions.shareLocation;
}

/** Whether the share should be pre-ticked, given the policy. */
export function locationDefaultsOn(settings: ArrivalSettings, permissions: ArrivalPermissions): boolean {
  return canShareLocation(settings, permissions) && settings.locationPolicy === 'on';
}

// -- Suggesting an ETA --------------------------------------------------------

const EARTH_MILES = 3958.8;

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * A straight-line ETA at ~28 mph (city driving), floored at 5 minutes.
 *
 * A SUGGESTION, never the answer: it seeds the picker and the tech always
 * overrides it, because they know about the bridge that's out and we don't.
 * Deliberately not traffic-aware — that needs a billed API call on every tap of
 * a button, and the person holding the phone is a better router than we are.
 */
export function estimateEtaMinutes(
  tech: { lat: number; lng: number } | null,
  dest: { lat: number; lng: number } | null,
): number | null {
  if (!tech || !dest || !Number.isFinite(tech.lat) || !Number.isFinite(dest.lat)) return null;
  return Math.max(5, Math.round((haversineMiles(tech, dest) / 28) * 60));
}

/**
 * The quick-pick closest to a suggestion, so a GPS answer of 23 minutes
 * pre-selects the "30 min" chip rather than dropping the tech into a custom
 * field they then have to think about.
 */
export function nearestEtaChoice(minutes: number): number {
  return ETA_CHOICES.reduce((best, choice) =>
    Math.abs(choice - minutes) < Math.abs(best - minutes) ? choice : best);
}

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b) * 1609.344;
}

/**
 * Close enough to ask "are you there?".
 *
 * 150m rather than something tight: phone GPS in a street of houses is good to
 * roughly this, and a geofence smaller than its own error never fires. The cost
 * of asking slightly early is one dismissed prompt; the cost of never asking is
 * a feature nobody notices exists.
 */
export const ARRIVAL_GEOFENCE_METERS = 150;

export function withinArrivalGeofence(
  tech: { lat: number; lng: number } | null,
  dest: { lat: number; lng: number } | null,
  radius = ARRIVAL_GEOFENCE_METERS,
): boolean {
  if (!tech || !dest) return false;
  return metersBetween(tech, dest) <= radius;
}

// -- The window ---------------------------------------------------------------

export type ArrivalWindowTimes = { start: Date; end: Date };

/**
 * Turn "I'm 15 minutes out" into the span we're willing to promise.
 *
 * An exact ETA is a zero-width window: the same shape, so every consumer
 * downstream (the text, the status page, the timeline) handles one case instead
 * of two. A window opens AT the estimate and runs later, rather than
 * straddling it — a customer told "2:00 to 2:30" who sees someone at 1:45 is
 * annoyed, and the tech said fifteen minutes, not "somewhere around fifteen".
 */
export function arrivalWindowTimes(
  from: Date,
  etaMinutes: number,
  settings: Pick<ArrivalSettings, 'windowStyle' | 'windowMinutes'>,
): ArrivalWindowTimes {
  const eta = clampInt(etaMinutes, MIN_ETA_MINUTES, MAX_ETA_MINUTES, 15);
  const start = new Date(from.getTime() + eta * 60_000);
  const width = settings.windowStyle === 'window'
    ? clampInt(settings.windowMinutes, MIN_WINDOW_MINUTES, MAX_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES)
    : 0;
  return { start, end: new Date(start.getTime() + width * 60_000) };
}

/**
 * The real instant of a wall-clock time in a given zone.
 *
 * Parsing "2026-08-03" + "08:00" with `new Date(...)` uses the SERVER's
 * timezone, which is how an 8 AM appointment becomes a 3 AM text message on a
 * UTC host. This converts through the zone properly, DST included.
 */
export function zonedInstant(day: string, hhmm: string, timeZone: string): Date | null {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hours) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const asUtc = new Date(`${day}T${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  return new Date(asUtc.getTime() + zoneOffsetMs(asUtc, timeZone));
}

/** How far a zone sits from UTC at a given instant. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  try {
    const zoned = new Date(instant.toLocaleString('en-US', { timeZone }));
    const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
    return utc.getTime() - zoned.getTime();
  } catch {
    return 0;
  }
}

export function formatClockTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    // An invalid IANA zone must not take down a status page.
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  }
}

/**
 * The window as a customer reads it. A zero-width window is a single time, not
 * "2:15 to 2:15".
 */
export function formatArrivalWindow(times: ArrivalWindowTimes | null, timeZone: string): string | null {
  if (!times) return null;
  const start = formatClockTime(times.start, timeZone);
  if (times.end.getTime() <= times.start.getTime()) return start;
  return `${start} to ${formatClockTime(times.end, timeZone)}`;
}

/**
 * How late the visit is running against its own promise, in whole minutes.
 * Zero until the late edge of the window has actually passed — a job inside its
 * window is on time, which is the entire reason for giving a window.
 */
export function minutesLate(times: ArrivalWindowTimes | null, now: Date): number {
  if (!times) return 0;
  return Math.max(0, Math.round((now.getTime() - times.end.getTime()) / 60_000));
}

// -- The message --------------------------------------------------------------

export const ARRIVAL_TOKENS = ['business', 'name', 'customer', 'eta', 'link'] as const;
export type ArrivalToken = (typeof ARRIVAL_TOKENS)[number];

export const DEFAULT_ARRIVAL_TEMPLATE =
  '{{business}}: {{name}} is on the way and should reach you {{eta}}. Track the visit here: {{link}}';

// The update wording carries NO link on purpose. The customer already has one
// from the first text, and their page is already showing this new time — a
// second link in the same thread is just a second thing to be confused by.
export const DEFAULT_DELAY_TEMPLATE =
  '{{business}}: running behind — {{name}} now expects to reach you {{eta}}. Sorry about that.';

export const DEFAULT_UPDATE_TEMPLATE =
  '{{business}}: update from {{name}} — now expecting to reach you {{eta}}.';

export type ArrivalTokenValues = {
  business: string;
  name: string;
  customer: string;
  eta: string;
  link: string;
};

/**
 * Substitute {{tokens}}. Unknown tokens are left alone rather than blanked: an
 * owner who typed {{adress}} should see their typo in the preview, not a
 * sentence with a hole in it where they can't tell what went wrong.
 */
export function renderTemplate(template: string, values: ArrivalTokenValues): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) => {
    const key = token.toLowerCase() as ArrivalToken;
    return ARRIVAL_TOKENS.includes(key) ? values[key] : whole;
  });
}

/** Tokens an owner used that we don't know about — surfaced next to the editor. */
export function unknownTokens(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    const token = match[1].toLowerCase();
    if (!ARRIVAL_TOKENS.includes(token as ArrivalToken)) found.add(match[1]);
  }
  return [...found];
}

/** How the ETA reads inside a sentence: "by 2:15", "between 2:15 and 2:45", or nothing. */
export function etaPhrase(times: ArrivalWindowTimes | null, timeZone: string): string {
  if (!times) return 'shortly';
  const start = formatClockTime(times.start, timeZone);
  if (times.end.getTime() <= times.start.getTime()) return `by ${start}`;
  return `between ${start} and ${formatClockTime(times.end, timeZone)}`;
}

export type ArrivalMessageInput = {
  template?: string | null;
  business: string;
  crewName: string;
  customerName: string;
  times: ArrivalWindowTimes | null;
  /** Empty on an update: the customer already holds the link from the first text. */
  trackingUrl: string;
  timeZone: string;
  /** Words the tech typed in the preview, replacing the template body entirely. */
  override?: string | null;
};

/**
 * The exact text that goes out.
 *
 * The tracking link and the opt-out are APPENDED after the tech's edit rather
 * than being part of what they can edit. A tech deleting the link (or the STOP
 * line) from the preview box is not a thing we can afford to let happen: one
 * leaves the customer with a status page they can't reach, the other is a
 * compliance problem. So the editable part is the sentence, and the machinery
 * is bolted on after.
 */
export function buildArrivalMessage(input: ArrivalMessageInput): string {
  const link = input.trackingUrl.trim();
  const values: ArrivalTokenValues = {
    business: input.business,
    name: firstName(input.crewName) || input.business,
    customer: firstName(input.customerName),
    eta: etaPhrase(input.times, input.timeZone),
    link,
  };

  const rendered = (input.override ?? renderTemplate(input.template?.trim() || DEFAULT_ARRIVAL_TEMPLATE, values)).trim();
  // Tidy up after a template that referenced {{link}} on an update, where there
  // is no link: "Track here:" with nothing after it reads like a bug.
  const body = link ? rendered : rendered.replace(/\s*[:—-]?\s*$/, '').trim();
  const withLink = !link || body.includes(link) ? body : `${body} ${link}`;
  return `${withLink.trim()} Reply STOP to opt out.`;
}

export function firstName(full: string): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

// -- Safeguards ---------------------------------------------------------------

/**
 * A second tap on the same trip. Below this the tech almost certainly
 * double-tapped or the page didn't visibly respond; above it they're plausibly
 * sending a real update, so we offer the update flow instead of blocking.
 */
export const DUPLICATE_WINDOW_SECONDS = 90;

export type DuplicateVerdict =
  | { kind: 'clear' }
  | { kind: 'double_tap'; secondsAgo: number }
  | { kind: 'already_sent'; sentAt: string; minutesAgo: number };

/**
 * Is this "on my way" a repeat? Distinguishes a stutter from a genuine resend,
 * because they deserve different answers: silently swallow the first, and offer
 * "send an updated ETA" for the second.
 */
export function duplicateVerdict(
  active: { status: ArrivalStatus; last_sent_at?: string | null; en_route_at?: string | null } | null,
  now: Date,
): DuplicateVerdict {
  if (!active) return { kind: 'clear' };
  if (active.status !== 'en_route' && active.status !== 'delayed') return { kind: 'clear' };
  const stamp = active.last_sent_at || active.en_route_at;
  if (!stamp) return { kind: 'clear' };
  const sentMs = new Date(stamp).getTime();
  if (!Number.isFinite(sentMs)) return { kind: 'clear' };
  const secondsAgo = Math.max(0, Math.round((now.getTime() - sentMs) / 1000));
  if (secondsAgo <= DUPLICATE_WINDOW_SECONDS) return { kind: 'double_tap', secondsAgo };
  return { kind: 'already_sent', sentAt: stamp, minutesAgo: Math.round(secondsAgo / 60) };
}

/**
 * Blur a tech's position for the public page. Three decimals is ~110m at the
 * equator: enough to read "a few streets away", not enough to read "parked
 * outside number 42".
 */
export function roundCoordinate(value: number, precision: LocationPrecision): number {
  if (precision === 'exact') return value;
  return Math.round(value * 1000) / 1000;
}

export function applyPrecision(
  point: { lat: number; lng: number } | null,
  precision: LocationPrecision,
): { lat: number; lng: number } | null {
  if (!point) return null;
  return { lat: roundCoordinate(point.lat, precision), lng: roundCoordinate(point.lng, precision) };
}

/** When a location share lapses on its own, whatever else happens. */
export function locationExpiry(from: Date, minutes = LOCATION_SHARE_MINUTES): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

/**
 * Should the public page still plot the tech? Every terminal state stops it, and
 * so does the clock — a share that outlives its own trip is the failure mode
 * this whole column exists to prevent.
 */
export function locationVisible(
  row: { status: ArrivalStatus; share_location?: boolean | null; location_expires_at?: string | null },
  now: Date,
): boolean {
  if (!row.share_location) return false;
  if (row.status !== 'en_route' && row.status !== 'delayed') return false;
  if (!row.location_expires_at) return false;
  const expires = new Date(row.location_expires_at).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

// -- Status vocabulary --------------------------------------------------------

/** What the HOMEOWNER sees. Plain, and never blaming them for anything. */
export const ARRIVAL_STATUS_HEADLINE: Record<ArrivalStatus, string> = {
  en_route: 'On the way',
  delayed: 'Running late',
  arrived: 'Arrived',
  no_access: "Couldn't get in",
  rescheduled: 'Visit rescheduled',
  cancelled: 'Visit cancelled',
  done: 'Visit complete',
};

/** What the CONTRACTOR sees in the timeline and on the job. */
export const ARRIVAL_STATUS_LABEL: Record<ArrivalStatus, string> = {
  en_route: 'En route',
  delayed: 'Running late',
  arrived: 'Arrived',
  no_access: 'No access to property',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  done: 'Complete',
};

/** A trip is live while it can still change. */
export function isActiveStatus(status: ArrivalStatus): boolean {
  return status === 'en_route' || status === 'delayed' || status === 'arrived';
}

/** After these, nothing more happens on this trip and the link stops working. */
export function isClosedStatus(status: ArrivalStatus): boolean {
  return status === 'no_access' || status === 'rescheduled' || status === 'cancelled' || status === 'done';
}

// -- What the homeowner can say back ------------------------------------------

export type HomeownerReplyId = 'ready' | 'gate_locked' | 'side_entrance' | 'call_on_arrival' | 'reschedule';

export type HomeownerReply = {
  id: HomeownerReplyId;
  /** The button. */
  label: string;
  /** What lands in the job timeline — written so the tech can act on it. */
  note: string;
  /** Confirmation shown back to the homeowner. */
  ack: string;
  /** Whether the contractor should be nudged rather than just logged. */
  urgent: boolean;
};

export const HOMEOWNER_REPLIES: HomeownerReply[] = [
  {
    id: 'ready',
    label: "I'm ready",
    note: 'Customer is home and ready for you.',
    ack: "Thanks — we've let them know you're ready.",
    urgent: false,
  },
  {
    id: 'gate_locked',
    label: 'Gate is locked',
    note: 'Gate is locked — customer needs to let you in.',
    ack: "Got it — we've told them the gate is locked.",
    urgent: true,
  },
  {
    id: 'side_entrance',
    label: 'Use the side entrance',
    note: 'Use the side entrance, not the front door.',
    ack: "Noted — they'll use the side entrance.",
    urgent: true,
  },
  {
    id: 'call_on_arrival',
    label: 'Call when you arrive',
    note: 'Customer asked for a call on arrival.',
    ack: "Will do — they'll call when they get there.",
    urgent: true,
  },
  {
    id: 'reschedule',
    label: 'I need to reschedule',
    note: 'Customer needs to reschedule this visit.',
    ack: "Thanks for the heads-up — they'll be in touch to rebook.",
    urgent: true,
  },
];

export function homeownerReply(id: string): HomeownerReply | null {
  return HOMEOWNER_REPLIES.find((reply) => reply.id === id) ?? null;
}

// -- Reporting back to whoever pressed the button -----------------------------

/**
 * What just happened, in the words the sender needs.
 *
 * A send whose text did not go out is reported as a FAILURE even though the
 * visit itself started fine, because the only question that matters next is
 * whether the customer is expecting a knock at the door. Shared by the field
 * app and the dashboard so the two can't drift into telling different stories
 * about the same outcome.
 */
export function describeArrivalOutcome(
  result: string | undefined,
  sms: string | undefined,
): { text: string; error: boolean } | null {
  if (!result) return null;
  switch (result) {
    case 'started':
    case 'revised': {
      const opener = result === 'started' ? 'On the way' : 'Arrival time updated';
      switch (sms) {
        case 'sent': return { text: `${opener} — the customer was texted ✓`, error: false };
        case 'opted_out': return { text: `${opener}, but this number opted out of texts. Give them a call.`, error: true };
        case 'no_phone': return { text: `${opener}, but there's no usable phone number on this job — nothing was sent.`, error: true };
        case 'not_configured': return { text: `${opener}, but texting isn't set up on this account — nothing was sent.`, error: true };
        case 'failed': return { text: `${opener}, but the text FAILED to send. The customer has not been told.`, error: true };
        default: return { text: `${opener} ✓`, error: false };
      }
    }
    case 'arrived': return { text: 'Marked arrived ✓', error: false };
    case 'no_access': return { text: 'Logged: no access to the property.', error: false };
    case 'rescheduled': return { text: 'Visit marked rescheduled.', error: false };
    case 'cancelled': return { text: 'Visit cancelled.', error: false };
    case 'duplicate': return { text: 'That already went out a moment ago — nothing was sent twice.', error: false };
    case 'forbidden': return { text: "You don't have permission to do that.", error: true };
    case 'no_active_trip': return { text: 'There is no visit in progress on this job.', error: true };
    case 'bad-eta': return { text: 'Enter an arrival time between 1 minute and 8 hours.', error: true };
    case 'not_found': return { text: 'That job could not be found.', error: true };
    default: return null;
  }
}
