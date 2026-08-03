import { coordOf, haversineMiles, minutesFromMiles, nearestMiles, type LatLng } from '@/lib/distance';
import { formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { greetingName, parseOfferReply, type OfferReply } from '@/lib/estimate-offers';

// Asking a customer to move day, and paying them to say yes.
//
// The mirror of estimate-offers. That module fills a hole in today's route with
// a nearby lead; this one takes a stop OUT of today because it is dragging the
// route sideways, and offers the customer a discount to take a day the truck is
// already going to be near them.
//
// The pairing only works when both halves are true, and the module refuses to
// suggest anything unless they are:
//   * moving it gives today a real saving (the detour it currently costs), and
//   * the day we are proposing genuinely passes close to them.
// A discount offered to move somebody from one inconvenient day to another is
// just money given away.
//
// Pure and I/O-free, for the same reasons as estimate-offers: every rule here is
// testable without a database, and straight-line haversine keeps the comparison
// honest — all the legs are measured the same way.

export const RESCHEDULE_STATUSES = ['sent', 'accepted', 'declined', 'canceled'] as const;
export type RescheduleStatus = (typeof RESCHEDULE_STATUSES)[number];

export type RescheduleOffer = {
  id: string;
  account_id: string;
  job_id: string;
  crew_id: string | null;
  status: RescheduleStatus;
  from_date: string;
  to_date: string;
  window_start: string;
  window_end: string;
  arrival_time: string;
  discount_percent: number;
  near_miles: number | null;
  saved_miles: number | null;
  saved_minutes: number | null;
  phone: string;
  body: string;
  sent_at: string;
  replied_at: string | null;
  reply_body: string | null;
  forwarded_at: string | null;
};

// -- The rules -----------------------------------------------------------------

/** What the owner can offer. Percent, because that is what an invoice discount is. */
export const DISCOUNT_OPTIONS = [5, 10, 15, 20] as const;
export const DEFAULT_DISCOUNT_PERCENT = 10;
/** Mirrors the check constraint. Anything past this is a typo, not a decision. */
export const MAX_DISCOUNT_PERCENT = 40;

/** How far ahead to look for a better day. */
export const LOOKAHEAD_DAYS = 21;

/**
 * How close the truck has to already come on the proposed day.
 *
 * The message says "we'll already be over your way" — so this is the number that
 * has to make that true. Wider than the instant-booking radius on purpose: this
 * customer is already yours and already booked, so the bar is "a short hop off
 * the route", not "we happen to be in the same county".
 */
export const MAX_NEAR_MILES = 6;

/**
 * The least this has to save before it is worth asking.
 *
 * Below about twenty minutes there is no case to put to a customer, and offering
 * money to fix a rounding error is a bad habit for a business to get into.
 */
export const MIN_SAVED_MINUTES = 20;

/** How many days to put in front of the owner at once. */
export const MAX_DAY_SUGGESTIONS = 3;

export const MAX_OFFER_BODY = 320;

// -- What today gets back ------------------------------------------------------

export type RouteNeighbour = { id: string; coord: LatLng | null };

/**
 * What dropping this stop gives back to the day it is on.
 *
 * Measured the only way that is honest: the two legs in and out of this stop,
 * minus the leg that would replace them if it were not there. A stop between two
 * neighbours costs the detour; a stop at the end of the day costs the whole
 * round trip to it, which is why the fallbacks matter.
 */
export function savingFromRemoving(input: {
  stop: LatLng | null;
  previous: LatLng | null;
  next: LatLng | null;
}): { miles: number; minutes: number } {
  const { stop, previous, next } = input;
  if (!stop) return { miles: 0, minutes: 0 };

  const inbound = previous ? haversineMiles(previous, stop) : 0;
  const outbound = next ? haversineMiles(stop, next) : 0;
  // The drive that happens instead, once this stop is gone.
  const bridged = previous && next ? haversineMiles(previous, next) : 0;

  const miles = Math.max(0, inbound + outbound - bridged);
  return { miles, minutes: Math.round(minutesFromMiles(miles)) };
}

// -- Which day to propose ------------------------------------------------------

export type CandidateDay = {
  dateKey: string;
  /** Where the truck already goes that day. Empty = nothing booked. */
  anchors: LatLng[];
  /** Arrival windows still free that day, as minutes-from-midnight pairs. */
  openWindows: Array<{ startMinutes: number; endMinutes: number }>;
};

export type DaySuggestion = {
  dateKey: string;
  /** Distance to the nearest thing already booked that day. */
  nearMiles: number;
  window: { startMinutes: number; endMinutes: number; arrivalMinutes: number; label: string };
};

/**
 * The days worth offering, nearest first.
 *
 * A day only qualifies when the truck already comes within MAX_NEAR_MILES of
 * this address AND there is a window free to put them in. An empty day is
 * excluded even though it has all the room in the world: with nothing else
 * booked there is no "we'll already be nearby", and saying it anyway is the one
 * thing that would make this feature a liar.
 */
export function rankDaySuggestions(input: {
  at: LatLng | null;
  days: CandidateDay[];
  limit?: number;
}): DaySuggestion[] {
  if (!input.at) return [];
  const at = input.at;

  const scored: DaySuggestion[] = [];
  for (const day of input.days) {
    if (day.anchors.length === 0) continue;
    const near = nearestMiles(at, day.anchors);
    if (near === null || near > MAX_NEAR_MILES) continue;

    // The widest window still free that day; a customer moving as a favour
    // should not also get the worst slot on offer.
    const best = [...day.openWindows].sort(
      (a, b) => b.endMinutes - b.startMinutes - (a.endMinutes - a.startMinutes),
    )[0];
    if (!best) continue;

    scored.push({
      dateKey: day.dateKey,
      nearMiles: near,
      window: {
        startMinutes: best.startMinutes,
        endMinutes: best.endMinutes,
        arrivalMinutes: best.startMinutes,
        label: `${formatTimeLabel(best.startMinutes)} to ${formatTimeLabel(best.endMinutes)}`,
      },
    });
  }

  return scored.sort((a, b) => a.nearMiles - b.nearMiles || a.dateKey.localeCompare(b.dateKey)).slice(0, input.limit ?? MAX_DAY_SUGGESTIONS);
}

/** Whether this stop is even worth asking about. */
export function isWorthMoving(saved: { minutes: number }): boolean {
  return saved.minutes >= MIN_SAVED_MINUTES;
}

// -- What we actually say ------------------------------------------------------

export function dayWord(dateKey: string, today: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const [ty, tm, td] = today.split('-').map(Number);
  const now = new Date(ty, (tm ?? 1) - 1, td ?? 1);
  const days = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * The part of the text the contractor edits.
 *
 * Everything the reply flow depends on — the business name, the YES/NO
 * instruction, the opt-out — lives in the envelope, so an edit cannot delete the
 * sentence that makes an answer mean something.
 *
 * The discount is named as a thank-you rather than a lure. The customer is being
 * asked for a favour; "we'll knock 10% off for the trouble" is what a tradesman
 * says, and "SAVE 10% NOW" is what a marketer says.
 */
export function draftRescheduleBody(input: {
  clientName: string | null;
  fromWord: string;
  toWord: string;
  windowLabel: string;
  discountPercent: number;
}): string {
  return (
    `Hi ${greetingName(input.clientName)} — we're booked solid ${input.fromWord} and we'll already be over your way ` +
    `${input.toWord}. Any chance we could move you to ${input.toWord}, ${input.windowLabel}? ` +
    `Happy to take ${input.discountPercent}% off the job for the trouble.`
  );
}

export const RESCHEDULE_REPLY_INSTRUCTION = 'Reply YES to move it or NO to keep your original time.';

export function composeRescheduleMessage(businessName: string, body: string): string {
  return `${businessName.trim()}: ${body.trim()} ${RESCHEDULE_REPLY_INSTRUCTION} Reply STOP to opt out.`;
}

export function rescheduleBodyProblem(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Write what you want to say to them first.';
  if (trimmed.length > MAX_OFFER_BODY) return `That's ${trimmed.length} characters — keep it under ${MAX_OFFER_BODY}.`;
  return null;
}

/**
 * Why this discount can't be sent, or null when it's fine.
 *
 * Checked here as well as by the constraint because this number comes off real
 * money, and the difference between catching it in a form and catching it at the
 * database is whether the customer ever saw the promise.
 */
export function discountProblem(percent: number): string | null {
  if (!Number.isFinite(percent)) return 'That discount is not a number.';
  if (percent <= 0) return 'A reschedule offer needs a discount — that is what you are asking them to say yes to.';
  if (percent > MAX_DISCOUNT_PERCENT) return `${percent}% is more than the ${MAX_DISCOUNT_PERCENT}% cap. Check that figure.`;
  return null;
}

/**
 * The starting state for the send form.
 *
 * Lives here rather than beside the action it belongs to because a 'use server'
 * module may only export async functions. Exporting this object from there
 * compiled fine and then failed at RUNTIME with a 500 on the whole action
 * module — including the unrelated suggestion call the panel makes on open.
 */
export type RescheduleActionState = { ok: boolean; message: string | null };
export const IDLE_RESCHEDULE_STATE: RescheduleActionState = { ok: false, message: null };

// -- Reading the answer --------------------------------------------------------

// Same parser as estimate offers. Shared rather than re-implemented so a
// customer's "yep" means the same thing whichever text they are answering —
// two lists of accept phrases would drift apart within a release.
export function parseRescheduleReply(body: string): OfferReply {
  return parseOfferReply(body);
}

// -- Display -------------------------------------------------------------------

export const RESCHEDULE_STATUS_LABEL: Record<RescheduleStatus, string> = {
  sent: 'Waiting on their reply',
  accepted: 'Moved — discount applied',
  declined: 'They kept their original day',
  canceled: 'You withdrew the offer',
};

export function storedWindowLabel(offer: Pick<RescheduleOffer, 'window_start' | 'window_end'>): string {
  const start = parseTimeMinutes(offer.window_start);
  const end = parseTimeMinutes(offer.window_end);
  if (start == null || end == null) return '';
  return `${formatTimeLabel(start)} to ${formatTimeLabel(end)}`;
}

/** What the discount is worth on a given quote, for showing the owner the cost. */
export function discountAmount(quotedAmount: number, percent: number): number {
  return Math.round(((Number(quotedAmount) || 0) * (Number(percent) || 0)) / 100);
}

export { coordOf };
