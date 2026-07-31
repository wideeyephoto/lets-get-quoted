import { coordOf, haversineMiles, minutesFromMiles, type LatLng } from '@/lib/distance';
import { formatTimeLabel, formatTimeMinutes, parseTimeMinutes, type PlannedStop } from '@/lib/route-plan';

// Offering a nearby lead the gap in today's route.
//
// A contractor with a two-hour hole between jobs and a lead ten minutes off the
// route is losing money to a scheduling problem, not a sales problem. This module
// finds that pairing, decides what window can honestly be promised, and drafts
// the text — but it never sends anything. The contractor approves the message
// before a homeowner hears from us, because an automated text from a stranger
// offering to come to your house is a very different thing from one you asked for.
//
// Pure and I/O-free: every decision here is testable without a database, a route
// service or a phone. Distances use straight-line haversine on purpose — all
// three legs of a detour are measured the same way, so the comparison is honest,
// and a suggestion the contractor may well ignore shouldn't bill a Distance
// Matrix lookup on every page load.

// -- Shape of an offer -------------------------------------------------------

export const OFFER_STATUSES = ['held', 'accepted', 'accepted_late', 'declined', 'expired', 'canceled'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type EstimateOffer = {
  id: string;
  account_id: string;
  lead_id: string;
  crew_id: string | null;
  status: OfferStatus;
  offer_date: string;
  window_start: string;
  window_end: string;
  arrival_time: string;
  visit_minutes: number;
  detour_miles: number | null;
  detour_minutes: number | null;
  after_stop_id: string | null;
  phone: string;
  body: string;
  hold_minutes: number;
  hold_expires_at: string;
  sent_at: string;
  replied_at: string | null;
  reply_body: string | null;
  forwarded_at: string | null;
  route_stop_id: string | null;
};

// -- The rules the offer has to live inside ----------------------------------

/** How long the contractor can reserve the slot while waiting for an answer. */
export const HOLD_MINUTE_OPTIONS = [30, 45, 60] as const;
export const DEFAULT_HOLD_MINUTES = 45;

/** How long an estimate visit takes. Adjustable per offer; this is the default. */
export const ESTIMATE_VISIT_OPTIONS = [30, 45, 60] as const;
export const DEFAULT_ESTIMATE_MINUTES = 30;

/**
 * The narrowest window worth promising a homeowner.
 *
 * Below an hour we'd be asking someone to be home for a slot we can't reliably
 * hit — a gap that tight is better left empty than turned into a broken promise.
 */
export const MIN_OFFER_WINDOW_MINUTES = 60;

/** And the widest. "Sometime in the next five hours" is not an appointment. */
export const MAX_OFFER_WINDOW_MINUTES = 180;

/**
 * How far off the route a lead can be before "close to your route" is a lie.
 *
 * Measured as extra DRIVING only — the visit itself is not a detour, it's the
 * work. Folding the half hour on site into this number would rule out every
 * lead on the block.
 */
export const MAX_DETOUR_MILES = 12;
export const MAX_DETOUR_MINUTES = 25;

/** How many suggestions to put in front of the contractor at once. */
export const MAX_SUGGESTIONS = 3;

/** Cap on the part of the message the contractor writes. */
export const MAX_OFFER_BODY = 320;

// -- Finding somewhere to put a stop ------------------------------------------

export type OfferAnchor = { id: string; coord: LatLng };

export type PlacementInput = {
  /** The day as the calendar has it — not the optimized proposal. */
  planned: PlannedStop[];
  /** Where the day starts and ends from, when we know. */
  homeBase: LatLng | null;
  workdayStartMinutes: number;
  workdayEndMinutes: number;
  bufferMinutes: number;
  visitMinutes: number;
};

export type Placement = {
  /** Index in `planned` this stop would be inserted before; planned.length = last. */
  index: number;
  /** The stop it follows, for the audit trail and for saying where it goes. */
  afterStopId: string | null;
  afterStopLabel: string | null;
  beforeStopLabel: string | null;
  /** Earliest and latest we could ARRIVE and still not disturb anyone. */
  earliestArrival: number;
  latestArrival: number;
  /** Extra driving this costs, over and above the leg it replaces. */
  detourMiles: number;
  detourMinutes: number;
  /** What the whole day grows by: the extra driving plus the visit and buffer. */
  addedMinutes: number;
};

function legMinutes(from: LatLng | null, to: LatLng | null): { miles: number; minutes: number } {
  if (!from || !to) return { miles: 0, minutes: 0 };
  const miles = haversineMiles(from, to);
  return { miles, minutes: minutesFromMiles(miles) };
}

/**
 * Every place a new stop could go in this day, with what it would cost.
 *
 * The one rule: nobody already booked gets moved. A slot only exists where the
 * new stop fits between when the crew is free and when they have to be somewhere
 * else — pushing a customer back to fit a lead in is exactly the trade this
 * feature must never make.
 */
export function findPlacements(input: PlacementInput, at: LatLng): Placement[] {
  const { planned, homeBase, workdayStartMinutes, workdayEndMinutes, bufferMinutes, visitMinutes } = input;
  const placements: Placement[] = [];

  for (let index = 0; index <= planned.length; index++) {
    const previous = index === 0 ? null : planned[index - 1];
    const next = index === planned.length ? null : planned[index];

    const fromCoord = previous ? coordOf(previous.stop) : homeBase;
    const toCoord = next ? coordOf(next.stop) : homeBase;
    // A stop with no coordinates can't anchor a detour measurement.
    if (previous && !fromCoord) continue;
    if (next && !toCoord) continue;

    const out = legMinutes(fromCoord, at);
    const back = legMinutes(at, toCoord);
    const skipped = legMinutes(fromCoord, toCoord);

    // Free from when the previous stop is done (departMinutes already includes
    // its buffer), or from the top of the workday.
    const freeFrom = previous ? previous.departMinutes : workdayStartMinutes;
    const earliestArrival = freeFrom + out.minutes;

    // The last moment we could arrive and still be gone in time. At the end of
    // the day that's the close of the workday; otherwise it's the next
    // customer's arrival, which we will not touch.
    const latestArrival = next
      ? next.arrivalMinutes - back.minutes - bufferMinutes - visitMinutes
      : workdayEndMinutes - visitMinutes;

    if (latestArrival < earliestArrival) continue;

    // The two new legs minus the drive that no longer happens. At the end of the
    // day with no home base there is no skipped leg, so the detour is simply
    // going there.
    const detourMiles = Math.max(0, out.miles + back.miles - skipped.miles);
    const detourMinutes = Math.max(0, Math.round(out.minutes + back.minutes - skipped.minutes));

    placements.push({
      index,
      afterStopId: previous?.stop.id ?? null,
      afterStopLabel: previous?.stop.label ?? null,
      beforeStopLabel: next?.stop.label ?? null,
      earliestArrival,
      latestArrival,
      detourMiles,
      detourMinutes,
      addedMinutes: detourMinutes + visitMinutes + bufferMinutes,
    });
  }

  return placements;
}

// -- The window we can honestly promise ---------------------------------------

export type OfferWindow = { startMinutes: number; endMinutes: number; arrivalMinutes: number; label: string };

/** Windows are quoted on the quarter hour. Nobody says "ten oh two". */
const WINDOW_GRANULARITY = 15;

/**
 * The arrival window for a placement, sized to the gap it fits in.
 *
 * Deliberately not a fixed band. A four-hour hole can carry a comfortable
 * three-hour window; a ninety-minute hole cannot, and stretching one to look
 * generous would promise time the day doesn't have. Returns null when what's
 * left is too narrow to ask someone to wait in.
 *
 * The edges are rounded INWARD — start up, end down — so the quoted window is
 * always a subset of the time we actually have. Rounding outward would buy a
 * tidy-looking "10:00 AM" by promising ten minutes that belong to the last job.
 */
export function offerWindow(placement: Placement): OfferWindow | null {
  const start = Math.ceil(placement.earliestArrival / WINDOW_GRANULARITY) * WINDOW_GRANULARITY;
  const latest = Math.floor(placement.latestArrival / WINDOW_GRANULARITY) * WINDOW_GRANULARITY;
  const room = latest - start;
  if (room < MIN_OFFER_WINDOW_MINUTES) return null;

  const end = start + Math.min(room, MAX_OFFER_WINDOW_MINUTES);
  return {
    startMinutes: start,
    endMinutes: end,
    // We plan to be there as the window opens; the rest is the slack that makes
    // the promise keepable.
    arrivalMinutes: start,
    label: `${formatTimeLabel(start)} to ${formatTimeLabel(end)}`,
  };
}

// -- Which lead to offer it to -------------------------------------------------

export type OfferCandidateLead = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  projectType: string | null;
  lat: number | null;
  lng: number | null;
};

export type OfferSuggestion = {
  lead: OfferCandidateLead;
  placement: Placement;
  window: OfferWindow;
};

/**
 * The best few lead-and-gap pairings for this day, closest first.
 *
 * A lead only appears when the detour is genuinely small — the message says
 * "we're working near you", and that has to be true. Leads already offered
 * something are excluded here rather than filtered in the UI, so there is one
 * place the never-twice rule is applied.
 */
export function rankOfferSuggestions(input: {
  placement: PlacementInput;
  leads: OfferCandidateLead[];
  alreadyOfferedLeadIds: ReadonlySet<string>;
  /**
   * Windows already promised to somebody and still waiting on an answer. A slot
   * that is being held is not free: offering it to a second lead is how two
   * people end up expecting you at two o'clock.
   */
  blocked?: Array<{ startMinutes: number; endMinutes: number }>;
  limit?: number;
}): OfferSuggestion[] {
  const suggestions: OfferSuggestion[] = [];
  const blocked = input.blocked ?? [];

  for (const lead of input.leads) {
    if (input.alreadyOfferedLeadIds.has(lead.id)) continue;
    if (!lead.phone) continue;
    const at = coordOf(lead);
    if (!at) continue;

    let best: OfferSuggestion | null = null;
    for (const placement of findPlacements(input.placement, at)) {
      if (placement.detourMiles > MAX_DETOUR_MILES) continue;
      if (placement.detourMinutes > MAX_DETOUR_MINUTES) continue;
      const window = offerWindow(placement);
      if (!window) continue;
      if (blocked.some((range) => window.startMinutes < range.endMinutes && range.startMinutes < window.endMinutes)) continue;
      if (!best || placement.detourMinutes < best.placement.detourMinutes) {
        best = { lead, placement, window };
      }
    }
    if (best) suggestions.push(best);
  }

  return suggestions
    .sort((a, b) => a.placement.detourMinutes - b.placement.detourMinutes || a.placement.detourMiles - b.placement.detourMiles)
    .slice(0, input.limit ?? MAX_SUGGESTIONS);
}

// -- What we actually say ------------------------------------------------------

/**
 * What to call somebody in a text.
 *
 * Shared by the draft and by every automated reply, so a lead who typed their
 * name in caps lock is greeted the same way in both — the answer they get back
 * should not read louder than the message they answered.
 */
export function greetingName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  if (!first) return 'there';
  // Intake forms are full of names typed in caps lock. "Hi HOLLY" reads as
  // shouting, and this is the first thing a stranger sees from this business.
  // Only touched when the whole word is uppercase, so McBride stays McBride.
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return first.charAt(0) + first.slice(1).toLowerCase();
  }
  return first;
}

/**
 * The part of the text the contractor edits.
 *
 * Everything that makes replies work — the business name up front, the YES/NO
 * instruction, the opt-out line — lives in the envelope instead, so an edit
 * can't accidentally delete the sentence the whole flow depends on.
 */
export function draftOfferBody(input: {
  leadName: string | null;
  projectType: string | null;
  windowLabel: string;
  dayWord: string;
}): string {
  const work = (input.projectType ?? '').trim();
  const about = work ? ` for your ${work.toLowerCase()}` : '';
  return `Hi ${greetingName(input.leadName)} — we're working in your area ${input.dayWord} and could stop by${about} to give you a free estimate between ${input.windowLabel}.`;
}

/** The reply instruction. Fixed, because a lead's yes has to mean something. */
export const OFFER_REPLY_INSTRUCTION = 'Reply YES to lock it in or NO if that does not work.';

/**
 * The exact message that gets sent. The panel previews this, not the body — a
 * preview of a different string than the one we send is not a preview.
 */
export function composeOfferMessage(businessName: string, body: string): string {
  return `${businessName.trim()}: ${body.trim()} ${OFFER_REPLY_INSTRUCTION} Reply STOP to opt out.`;
}

/** Why this body can't be sent, or null when it's fine. */
export function offerBodyProblem(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Write what you want to say to them first.';
  if (trimmed.length > MAX_OFFER_BODY) return `That's ${trimmed.length} characters — keep it under ${MAX_OFFER_BODY}.`;
  return null;
}

// -- Reading the answer --------------------------------------------------------

export type OfferReply = 'accept' | 'decline' | 'unclear';

const ACCEPT_PHRASES = new Set([
  'YES', 'Y', 'YEAH', 'YEP', 'YUP', 'YE', 'SURE', 'OK', 'OKAY', 'K', 'CONFIRM', 'CONFIRMED',
  'YES PLEASE', 'SOUNDS GOOD', 'THAT WORKS', 'WORKS FOR ME', 'YES THANKS', 'PLEASE DO', 'GO AHEAD', '1',
]);

const DECLINE_PHRASES = new Set([
  'NO', 'N', 'NOPE', 'NAH', 'NO THANKS', 'NO THANK YOU', 'NOT TODAY', 'CANT', 'CANT TODAY',
  'NOT INTERESTED', 'NO GOOD', 'DOESNT WORK', 'PASS', '2',
]);

const ACCEPT_TOKENS = new Set(['YES', 'Y', 'YEAH', 'YEP', 'YUP', 'SURE', 'OK', 'OKAY']);
const DECLINE_TOKENS = new Set(['NO', 'N', 'NOPE', 'NAH', 'CANT', 'CANNOT']);

function normalizeReply(body: string): string {
  return body
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Yes, no, or neither.
 *
 * Deliberately hard to say yes by accident. A whole message that IS an answer
 * counts; so does a very short message that opens with one and contradicts
 * nothing. Everything else is 'unclear' — which is not a failure, it's a
 * message for the contractor to read. Booking a stranger's afternoon off a
 * hopeful guess at "yes but can you do Tuesday" is the mistake worth avoiding.
 */
export function parseOfferReply(body: string): OfferReply {
  const normalized = normalizeReply(body);
  if (!normalized) return 'unclear';
  if (ACCEPT_PHRASES.has(normalized)) return 'accept';
  if (DECLINE_PHRASES.has(normalized)) return 'decline';

  const words = normalized.split(' ');
  if (words.length > 3) return 'unclear';
  const hasAccept = words.some((word) => ACCEPT_TOKENS.has(word));
  const hasDecline = words.some((word) => DECLINE_TOKENS.has(word));
  // "yes no" is not an answer either way.
  if (hasAccept && hasDecline) return 'unclear';
  if (hasAccept && ACCEPT_TOKENS.has(words[0])) return 'accept';
  if (hasDecline && DECLINE_TOKENS.has(words[0])) return 'decline';
  return 'unclear';
}

// -- The hold ------------------------------------------------------------------

export type HoldState = { holding: boolean; minutesLeft: number; expiresLabel: string };

/**
 * Where an offer stands right now.
 *
 * Expiry is computed on read rather than swept by a job: a hold that has run out
 * must look expired the instant it does, and nothing should depend on a cron
 * having fired to stop reserving a slot.
 */
export function holdState(offer: Pick<EstimateOffer, 'status' | 'hold_expires_at'>, now = new Date()): HoldState {
  const expires = new Date(offer.hold_expires_at).getTime();
  const holding = offer.status === 'held' && Number.isFinite(expires) && expires > now.getTime();
  return {
    holding,
    minutesLeft: holding ? Math.max(1, Math.ceil((expires - now.getTime()) / 60000)) : 0,
    expiresLabel: Number.isFinite(expires)
      ? new Date(expires).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '',
  };
}

/** What the contractor sees an offer as, once expiry is taken into account. */
export function displayStatus(offer: Pick<EstimateOffer, 'status' | 'hold_expires_at'>, now = new Date()): OfferStatus {
  if (offer.status === 'held' && !holdState(offer, now).holding) return 'expired';
  return offer.status;
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  held: 'Waiting on their reply',
  accepted: 'Booked',
  accepted_late: 'Said yes, too late',
  declined: 'They said no',
  expired: 'No reply in time',
  canceled: 'You released the slot',
};

// -- Validation for the send action ---------------------------------------------

/**
 * Whether the window the browser posted back is one we're willing to send.
 *
 * The suggestion came from this server a moment ago, but it arrives back through
 * a form, so it gets checked rather than trusted — a hand-edited window could
 * otherwise promise a time in the middle of another customer's appointment.
 */
export function windowProblem(input: { startMinutes: number; endMinutes: number; arrivalMinutes: number }): string | null {
  const { startMinutes, endMinutes, arrivalMinutes } = input;
  if (![startMinutes, endMinutes, arrivalMinutes].every((value) => Number.isFinite(value))) return 'That window is not a real time.';
  if (startMinutes < 0 || endMinutes > 23 * 60 + 59) return 'That window falls outside the day.';
  const width = endMinutes - startMinutes;
  if (width < MIN_OFFER_WINDOW_MINUTES) return `An arrival window needs to be at least ${MIN_OFFER_WINDOW_MINUTES} minutes.`;
  if (width > MAX_OFFER_WINDOW_MINUTES) return `An arrival window can't be longer than ${MAX_OFFER_WINDOW_MINUTES / 60} hours.`;
  if (arrivalMinutes < startMinutes || arrivalMinutes > endMinutes) return 'The planned arrival has to sit inside the window.';
  return null;
}

export function timeFromMinutes(minutes: number): string {
  return formatTimeMinutes(minutes);
}

export function minutesFromTime(time: string | null): number | null {
  return parseTimeMinutes(time);
}

/** "8:00 AM to 11:00 AM" from the stored times, for showing a sent offer back. */
export function storedWindowLabel(offer: Pick<EstimateOffer, 'window_start' | 'window_end'>): string {
  const start = parseTimeMinutes(offer.window_start);
  const end = parseTimeMinutes(offer.window_end);
  if (start == null || end == null) return '';
  return `${formatTimeLabel(start)} to ${formatTimeLabel(end)}`;
}
