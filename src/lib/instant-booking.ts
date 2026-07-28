// The instant-booking eligibility gate. Given signals that are ALL knowable
// before a site visit (the AI estimate range, service-area fit, job-type
// exclusions, fully-booked posture, and the owner's value floor), decide whether
// a visitor may self-book a premium slot or should be routed to a graceful
// "request a callback" fallback. Pure + side-effect-free so it is unit-testable
// and can be enforced identically at slot-listing and at submit.
//
// Philosophy (mirrors the lead intake's "flags demote, never reject"): the gate
// only decides whether the SELF-SERVICE premium slot is offered. Every fallback
// still captures a real lead — nothing is ever a dead end. And because a booking
// is a request the owner approves (not an auto-confirm), an UNKNOWN value soft-
// passes rather than blocking a possibly-good job.

export type BookingVerdictTier =
  | 'disabled' // gate off — booking open to everyone (current behavior)
  | 'instant' // eligible to self-book a premium slot
  | 'value_fallback' // estimate is below the owner's floor
  | 'area_fallback' // outside the service area
  | 'excluded_fallback' // work the owner doesn't take
  | 'booked_fallback'; // fully-booked mode is active

export type BookingVerdict = {
  tier: BookingVerdictTier;
  eligible: boolean; // may self-book a premium slot
  reason: string; // internal/debug explanation
};

export type BookingGateSignals = {
  enabled: boolean; // accounts.instant_book_enabled
  minAmount: number; // accounts.instant_book_min_amount (0 = no floor)
  fullyBooked: boolean; // site leadFilters.fullyBooked via isFullyBookedActive()
  estimateMax: number | null; // top of the AI estimate range; null = unknown
  inArea: boolean | null; // AI in_area (null = unknown / not asked)
  excluded: boolean; // AI excluded: work the owner listed as not-taken
};

export function evaluateBookingEligibility(signals: BookingGateSignals): BookingVerdict {
  if (!signals.enabled) {
    return { tier: 'disabled', eligible: true, reason: 'Instant-booking gate off — booking open to everyone.' };
  }
  // Hard posture the owner set — check before value so a fully-booked or
  // out-of-area visitor gets the most relevant message.
  if (signals.fullyBooked) {
    return { tier: 'booked_fallback', eligible: false, reason: 'Fully-booked mode is active.' };
  }
  if (signals.excluded) {
    return { tier: 'excluded_fallback', eligible: false, reason: "Job is work the owner doesn't take." };
  }
  if (signals.inArea === false) {
    return { tier: 'area_fallback', eligible: false, reason: 'Address is outside the service area.' };
  }
  // Value floor bites ONLY when we actually have an estimate below it. Unknown
  // value soft-passes — the owner still approves the request, so we don't turn
  // away a job we simply couldn't price.
  if (signals.minAmount > 0 && signals.estimateMax != null && signals.estimateMax < signals.minAmount) {
    return { tier: 'value_fallback', eligible: false, reason: 'Estimate is below the instant-booking value floor.' };
  }
  return { tier: 'instant', eligible: true, reason: 'Eligible to self-book a premium slot.' };
}

// Customer-facing copy per fallback tier — honest, framed as service not denial.
// The eligible ('instant'/'disabled') tiers don't use these (they see slots).
export function bookingFallbackMessage(tier: BookingVerdictTier, businessName: string): { heading: string; body: string } {
  switch (tier) {
    case 'booked_fallback':
      return {
        heading: `${businessName} is booked up right now`,
        body: 'Leave your details and they’ll reach out as soon as a slot opens.',
      };
    case 'area_fallback':
      return {
        heading: 'You’re just outside the instant-booking area',
        body: `Share your project and ${businessName} will confirm whether they can get to you.`,
      };
    case 'excluded_fallback':
      return {
        heading: 'Let’s get you the right person',
        body: `Tell ${businessName} about the job and they’ll follow up to schedule.`,
      };
    case 'value_fallback':
    default:
      return {
        heading: 'Tell us about your project',
        body: `${businessName} will reach out to schedule a visit that fits.`,
      };
  }
}

// Clamp a $ floor from settings input (0 = off).
export function normalizeInstantBookMinAmount(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// "Nearby" radius (miles) for route-density; clamp 1–100, default 15.
export function normalizeInstantBookRadiusMiles(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 15;
}

// Route-density mode: 'prefer' (default) or 'restrict'.
export function normalizeGeoMode(value: unknown): 'prefer' | 'restrict' {
  return value === 'restrict' ? 'restrict' : 'prefer';
}
