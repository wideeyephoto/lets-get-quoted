// Putting one job to several subcontractors, and letting the first qualified
// yes win.
//
// This file is the RULES. What state a request is in, who should be offered it,
// what the text says, what a link looks like, and what an owner is allowed to
// send. None of it touches a database or a phone — lib/subcontractor-dispatch-data
// does that — which is what lets the dispatch page, the job page and the public
// proposal page all reach the same verdict from the same code.
//
// The one idea worth holding on to: a request's status is DERIVED, never swept.
// An offer that ran out of time has to look expired the instant it does, and
// "how many have looked at it" has to be true on the page the owner is staring
// at, not true as of whenever a cron last ran.

import { haversineMiles, type LatLng } from '@/lib/distance';
import { SUB_STATUS_RANK, type Compliance, type SubMetrics, type SubStatus } from '@/lib/subcontractors';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// -- statuses ------------------------------------------------------------------

export const REQUEST_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'partially_responded',
  'claimed',
  'expired',
  'cancelled',
  'reopened',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  partially_responded: 'Partially responded',
  claimed: 'Claimed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
};

/**
 * The tone each status wears. Named against the existing dashboard vocabulary
 * (ok / warn / alert / muted) so the chips match every other status pill in the
 * app rather than inventing a fourth palette.
 */
export const REQUEST_STATUS_TONE: Record<RequestStatus, 'ok' | 'warn' | 'alert' | 'muted' | 'info'> = {
  draft: 'muted',
  sent: 'info',
  viewed: 'info',
  partially_responded: 'warn',
  claimed: 'ok',
  expired: 'alert',
  cancelled: 'muted',
  reopened: 'warn',
};

export const OFFER_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'failed',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'covered',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  // Not "lost". Nobody lost anything — somebody else got there first, and the
  // word a subcontractor reads on their own screen should say so plainly.
  covered: 'Covered by another sub',
};

/** Offers still capable of turning into cover. */
export const LIVE_OFFER_STATUSES: readonly OfferStatus[] = ['queued', 'sent', 'delivered', 'viewed', 'failed'];

/** Request states an acceptance may still be applied to. */
export const CLAIMABLE_REQUEST_STATUSES: readonly RequestStatus[] = [
  'sent',
  'viewed',
  'partially_responded',
  'reopened',
];

export const SELECTION_MODES = ['first_accept', 'collect_interest'] as const;
export type SelectionMode = (typeof SELECTION_MODES)[number];

export const SELECTION_MODE_LABEL: Record<SelectionMode, string> = {
  first_accept: 'First qualified acceptance wins',
  collect_interest: 'Collect interest and choose myself',
};

export const SELECTION_MODE_HINT: Record<SelectionMode, string> = {
  first_accept: 'The job is assigned the moment somebody accepts, and every other offer closes.',
  collect_interest: 'Everybody can say they are available. Nothing is assigned until you pick one.',
};

export function normalizeSelectionMode(value: unknown): SelectionMode {
  return value === 'collect_interest' ? 'collect_interest' : 'first_accept';
}

// -- the request, as the rest of the app sees it --------------------------------

export type DispatchRequest = {
  id: string;
  jobId: string;
  status: RequestStatus;
  workDescription: string;
  serviceDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  generalLocation: string;
  payAmount: number;
  payKind: 'fixed' | 'hourly' | 'day_rate';
  requiredTrade: string;
  requiredSkills: string[];
  requiresLicense: boolean;
  requiresInsurance: boolean;
  expiresAt: string;
  selectionMode: SelectionMode;
  documentPaths: string[];
  messageBody: string;
  claimedOfferId: string | null;
  claimedCrewId: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type DispatchOffer = {
  id: string;
  requestId: string;
  crewId: string;
  status: OfferStatus;
  phone: string;
  body: string;
  distanceMiles: number | null;
  matchReason: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  declineReason: string | null;
  question: string | null;
  backup: boolean;
};

/**
 * What this request IS right now, expiry and replies taken into account.
 *
 * The stored column is the last thing anybody wrote; this is the truth. A
 * request whose window closed forty seconds ago is expired on the screen it is
 * being read on, without anything having had to run.
 */
export function requestDisplayStatus(
  request: Pick<DispatchRequest, 'status' | 'expiresAt'>,
  offers: Pick<DispatchOffer, 'status' | 'viewedAt'>[],
  now: Date = new Date(),
): RequestStatus {
  // Terminal states stay put. A claimed request does not become "expired"
  // because its original deadline has since passed — somebody took the job.
  if (request.status === 'claimed' || request.status === 'cancelled' || request.status === 'draft') {
    return request.status;
  }

  if (new Date(request.expiresAt).getTime() <= now.getTime()) return 'expired';

  const responded = offers.some((offer) => offer.status === 'declined' || offer.status === 'accepted');
  if (responded) return 'partially_responded';
  if (offers.some((offer) => offer.status === 'viewed' || offer.viewedAt)) return 'viewed';
  // 'reopened' outranks 'sent' only until somebody looks — after that, what
  // matters is that it is being read, not that it is second time around.
  return request.status === 'reopened' ? 'reopened' : 'sent';
}

export type RequestProgress = {
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  viewed: number;
  declined: number;
  accepted: number;
  covered: number;
  interested: number;
  /** Null once the request is settled — nothing is counting down any more. */
  minutesRemaining: number | null;
  expired: boolean;
};

export function requestProgress(
  request: Pick<DispatchRequest, 'status' | 'expiresAt'>,
  offers: Pick<DispatchOffer, 'status' | 'viewedAt' | 'backup'>[],
  now: Date = new Date(),
): RequestProgress {
  const count = (status: OfferStatus) => offers.filter((offer) => offer.status === status).length;
  const expiresMs = new Date(request.expiresAt).getTime();
  const settled = request.status === 'claimed' || request.status === 'cancelled' || request.status === 'draft';
  const expired = !settled && expiresMs <= now.getTime();

  return {
    recipients: offers.length,
    // "Sent" means it left the building, whatever happened to it afterwards —
    // an owner counting how many people were asked should not see the number
    // drop when one of them opens the link.
    sent: offers.filter((offer) => offer.status !== 'queued').length,
    delivered: offers.filter((offer) => offer.status === 'delivered' || offer.status === 'viewed').length,
    failed: count('failed'),
    viewed: offers.filter((offer) => offer.viewedAt !== null || offer.status === 'viewed').length,
    declined: count('declined'),
    accepted: count('accepted'),
    covered: count('covered'),
    // Collect-interest mode: an acceptance here is a hand up, not a claim.
    interested: offers.filter((offer) => offer.status === 'accepted' || offer.backup).length,
    minutesRemaining: settled || expired ? null : Math.max(0, Math.ceil((expiresMs - now.getTime()) / 60000)),
    expired,
  };
}

/** "3h 20m left", "12m left", "Expired". */
export function formatTimeRemaining(minutes: number | null): string {
  if (minutes === null) return 'Closed';
  if (minutes <= 0) return 'Expired';
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`;
  return `${Math.round(hours / 24)}d left`;
}

// -- who to offer it to ----------------------------------------------------------

export type MatchCandidate = {
  crewId: string;
  name: string;
  companyName: string | null;
  trades: string[];
  skills: string[];
  subStatus: SubStatus;
  active: boolean;
  emergencyAvailable: boolean;
  availabilityNote: string | null;
  travelRadiusMiles: number | null;
  coord: LatLng | null;
  compliance: Compliance;
  metrics: SubMetrics;
  /** Job refs this firm is already booked on for the request's date. */
  conflicts: string[];
  hasPhone: boolean;
};

export type MatchRequirements = {
  requiredTrade: string;
  requiredSkills: string[];
  requiresLicense: boolean;
  requiresInsurance: boolean;
  /** Where the work is. Null when the job has never been geocoded. */
  jobCoord: LatLng | null;
};

export type ScoredCandidate = {
  candidate: MatchCandidate;
  score: number;
  distanceMiles: number | null;
  /** Why they are on the list, in the words the recipient panel shows. */
  reasons: string[];
  /** Why they cannot be sent this. Non-empty means the checkbox is disabled. */
  blockers: string[];
  eligible: boolean;
  /** Ticked by default when the composer opens. */
  recommended: boolean;
};

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

export function hasTrade(candidate: Pick<MatchCandidate, 'trades'>, trade: string): boolean {
  const wanted = normalizeTag(trade);
  if (!wanted) return true;
  return candidate.trades.some((entry) => normalizeTag(entry) === wanted);
}

/**
 * Every saved subcontractor, ranked for one job.
 *
 * Nobody is hidden. A firm that cannot take this work still appears, with the
 * reason it cannot written on it — because "why isn't Northline in this list"
 * is a question an owner will otherwise answer by assuming the feature is
 * broken. `eligible` is what the UI disables on; `recommended` is what it ticks.
 *
 * The score is a sum of things an owner would say out loud, in the order they
 * would say them: the right trade, actually able to take it, close by, reliable,
 * and one you like working with.
 */
export function rankCandidates(candidates: MatchCandidate[], requirements: MatchRequirements): ScoredCandidate[] {
  const scored = candidates.map((candidate): ScoredCandidate => {
    const reasons: string[] = [];
    const blockers: string[] = [];
    let score = 0;

    const distanceMiles =
      requirements.jobCoord && candidate.coord ? Math.round(haversineMiles(candidate.coord, requirements.jobCoord) * 10) / 10 : null;

    // --- can they be sent this at all -------------------------------------
    if (!candidate.active) blockers.push('Archived from the roster');
    if (candidate.subStatus === 'archived') blockers.push('Marked archived');
    if (!candidate.hasPhone) blockers.push('No mobile number on file');
    if (requirements.requiresLicense && !candidate.compliance.licenseOk) blockers.push('License not current');
    if (requirements.requiresInsurance && !candidate.compliance.insuranceOk) blockers.push('Insurance not current');

    // --- trade ---------------------------------------------------------------
    const tradeMatch = hasTrade(candidate, requirements.requiredTrade);
    if (requirements.requiredTrade) {
      if (tradeMatch) {
        score += 100;
        reasons.push(requirements.requiredTrade);
      } else {
        blockers.push(`Does not list ${requirements.requiredTrade}`);
      }
    }

    const wantedSkills = requirements.requiredSkills.map(normalizeTag).filter(Boolean);
    if (wantedSkills.length > 0) {
      const have = new Set([...candidate.skills, ...candidate.trades].map(normalizeTag));
      const matched = wantedSkills.filter((skill) => have.has(skill));
      score += matched.length * 12;
      if (matched.length > 0) reasons.push(`${matched.length} of ${wantedSkills.length} skills`);
    }

    // --- distance -------------------------------------------------------------
    if (distanceMiles !== null) {
      const radius = candidate.travelRadiusMiles;
      if (radius !== null && distanceMiles > radius) {
        // NOT a blocker. A firm 18 miles out with a 15-mile radius will often
        // still say yes to the right job, and refusing to let an owner ask them
        // is the app overruling somebody who knows their own trade.
        reasons.push(`${distanceMiles} mi — past their ${radius} mi radius`);
        score -= 25;
      } else {
        reasons.push(`${distanceMiles} mi away`);
        score += Math.max(0, 40 - distanceMiles * 1.5);
      }
    }

    // --- compliance, as a preference on top of the hard gate ------------------
    if (candidate.compliance.overall === 'ok') score += 15;
    else if (candidate.compliance.overall === 'expiring') score += 5;
    else score -= 10;

    // --- how they have behaved ------------------------------------------------
    const { metrics } = candidate;
    if (metrics.rating !== null) {
      score += (metrics.rating - 3) * 10;
      reasons.push(`${metrics.rating.toFixed(1)} internal rating`);
    }
    if (metrics.acceptanceRate !== null) score += metrics.acceptanceRate * 20;
    if (metrics.responseMinutes !== null && metrics.responseMinutes <= 15) {
      score += 10;
      reasons.push('Fast responder');
    }
    if (metrics.completed > 0) {
      score += Math.min(15, metrics.completed);
      reasons.push(`${metrics.completed} completed`);
    }

    // --- how you feel about them ----------------------------------------------
    if (candidate.subStatus === 'preferred') {
      score += 35;
      reasons.push('Preferred');
    } else if (candidate.subStatus === 'backup') {
      score -= 20;
      reasons.push('Backup');
    }

    // --- already busy -----------------------------------------------------------
    if (candidate.conflicts.length > 0) {
      score -= 45;
      // Also not a blocker: a two-hour water heater on a day they are already
      // out is the sub's call to make, not ours.
      reasons.push(`Already on ${candidate.conflicts.join(', ')} that day`);
    } else {
      reasons.push('Available');
    }

    if (candidate.emergencyAvailable) score += 3;

    const eligible = blockers.length === 0;
    return {
      candidate,
      score,
      distanceMiles,
      reasons,
      blockers,
      eligible,
      // Ticked by default only where there is no argument against it: eligible,
      // free that day, compliant, and either preferred or a trade match. An
      // owner who opens the composer and presses Send should have sent it to
      // people they would have chosen anyway.
      recommended:
        eligible &&
        candidate.conflicts.length === 0 &&
        candidate.compliance.overall !== 'expired' &&
        (candidate.subStatus === 'preferred' || (tradeMatch && candidate.subStatus === 'active')),
    };
  });

  return scored.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.score - a.score ||
      SUB_STATUS_RANK[a.candidate.subStatus] - SUB_STATUS_RANK[b.candidate.subStatus] ||
      a.candidate.name.localeCompare(b.candidate.name),
  );
}

// -- what the text says -----------------------------------------------------------

/** The placeholder the owner may move around but must not delete. */
export const LINK_PLACEHOLDER = '[secure link]';

/**
 * A text is 160 characters a segment and this one has to carry a URL. 320 is
 * two segments with room for the link; past that an owner is writing a letter
 * and should put it in the scope instead.
 */
export const MAX_OFFER_MESSAGE = 320;

export function formatPay(amount: number, kind: 'fixed' | 'hourly' | 'day_rate' = 'fixed'): string {
  const money = `$${Math.round(amount).toLocaleString('en-US')}`;
  if (kind === 'hourly') return `${money}/hr`;
  if (kind === 'day_rate') return `${money}/day`;
  return money;
}

/**
 * The draft the composer opens with.
 *
 * Written to be edited. Everything in it is a fact the sub needs before they can
 * answer — who, what, where, when, how much, by when — and nothing in it is
 * private: no street address, no customer name, no phone number. That is not a
 * style choice, it is the same rule the public page enforces, applied at the
 * only other place the words are chosen.
 */
export function draftOfferMessage(input: {
  businessName: string;
  workDescription: string;
  generalLocation: string;
  whenLabel: string;
  payAmount: number;
  payKind?: 'fixed' | 'hourly' | 'day_rate';
  expiresLabel: string;
}): string {
  const where = input.generalLocation.trim();
  const when = input.whenLabel.trim();
  const place = [where ? `in ${where}` : '', when].filter(Boolean).join(', ');
  return [
    `New subcontract job from ${input.businessName.trim()}:`,
    `${input.workDescription.trim()}${place ? ` ${place}` : ''}.`,
    `Pay ${formatPay(input.payAmount, input.payKind ?? 'fixed')}.`,
    `Review and accept by ${input.expiresLabel.trim()}: ${LINK_PLACEHOLDER}`,
  ].join(' ');
}

/** The body with this recipient's own link in it. One link, one person. */
export function personalizeOfferMessage(body: string, link: string): string {
  const trimmed = body.trim();
  return trimmed.includes(LINK_PLACEHOLDER) ? trimmed.split(LINK_PLACEHOLDER).join(link) : `${trimmed} ${link}`;
}

/** Why this message cannot be sent, or null when it is fine. */
export function offerMessageProblem(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Write the message before sending it.';
  if (!trimmed.includes(LINK_PLACEHOLDER)) {
    return `Keep ${LINK_PLACEHOLDER} in the message — it becomes each subcontractor's own private link.`;
  }
  if (trimmed.length > MAX_OFFER_MESSAGE) {
    return `That is ${trimmed.length} characters — keep it under ${MAX_OFFER_MESSAGE}.`;
  }
  return null;
}

// -- validating a request before it exists ------------------------------------------

export type RequestDraftInput = {
  jobId: string;
  workDescription: string;
  generalLocation: string;
  payAmount: number;
  expiresAt: string;
  serviceDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  requiredTrade: string;
};

/**
 * Everything that would make a request unanswerable, checked in one place so
 * the composer and the server action refuse the same things for the same
 * reasons.
 */
export function requestDraftProblem(input: RequestDraftInput, now: Date = new Date()): string | null {
  if (!input.jobId) return 'Pick the job this work belongs to.';
  if (!input.workDescription.trim()) return 'Describe the work — this is what a subcontractor decides on.';
  if (!input.generalLocation.trim()) return 'Add a general location, such as the city. Never the full address.';
  if (!Number.isFinite(input.payAmount) || input.payAmount <= 0) return 'Enter what the subcontractor gets paid.';
  if (!input.requiredTrade.trim()) return 'Pick the trade this needs, so the right people are suggested.';

  const expires = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expires)) return 'That offer expiration is not a real time.';
  if (expires <= now.getTime()) return 'The offer expiration has already passed. Pick a later time.';

  if (input.windowStart && input.windowEnd && input.windowEnd <= input.windowStart) {
    return 'The arrival window has to end after it starts.';
  }
  if ((input.windowStart || input.windowEnd) && !input.serviceDate) {
    return 'Add the date the arrival window belongs to.';
  }
  return null;
}

/** "Friday, Aug 15 · 9–11 AM" — one label, shared by the text and both pages. */
export function scheduleLabel(input: {
  serviceDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}): string {
  const parts: string[] = [];
  if (input.serviceDate) {
    // Parsed as UTC noon so a date-only string cannot slide a day backwards in
    // a western timezone, which is the classic way "Friday" becomes "Thursday".
    const date = new Date(`${input.serviceDate}T12:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      );
    }
  }
  const window = formatWindow(input.windowStart, input.windowEnd);
  if (window) parts.push(window);
  return parts.join(' · ');
}

export function formatWindow(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const label = (time: string) => {
    const [rawHour, rawMinute] = time.split(':');
    const hour = Number(rawHour);
    const minute = Number(rawMinute ?? 0);
    if (!Number.isFinite(hour)) return time;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return minute ? `${display}:${String(minute).padStart(2, '0')} ${suffix}` : `${display} ${suffix}`;
  };
  const from = label(start);
  const to = label(end);
  // "9–11 AM" rather than "9 AM–11 AM" when both sit in the same half of the
  // day: it is how a person says it out loud.
  const sameSuffix = from.slice(-2) === to.slice(-2);
  return sameSuffix ? `${from.slice(0, -3)}–${to}` : `${from}–${to}`;
}

/**
 * "Royal Oak, MI" from "1420 N Main St, Royal Oak, MI 48067".
 *
 * The composer's default for the general-location field, and the reason it has
 * a default at all: the honest thing to put in front of strangers is the area,
 * and an owner asked to type it by hand will paste the address. The ZIP goes
 * too — a ZIP is a good deal more precise than "the general area" is meant to be.
 *
 * Lives here rather than beside the composer because a Next page module may only
 * export the handful of names the framework knows; exporting a helper from one
 * fails the build's page-type check with a message that names a generated file.
 */
export function generalLocationFrom(address: string | null): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const state = parts[parts.length - 1].replace(/\s*\d{5}(-\d{4})?$/, '').trim();
  const city = parts[parts.length - 2];
  return [city, state].filter(Boolean).join(', ');
}

/** "Today at 6:00 PM" / "Fri at 6:00 PM" — how the deadline reads in a text. */
export function expiryLabel(expiresAt: string, now: Date = new Date(), timeZone?: string): string {
  const when = new Date(expiresAt);
  if (Number.isNaN(when.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone };
  const time = when.toLocaleTimeString('en-US', options);
  const sameDay = when.toDateString() === now.toDateString();
  if (sameDay) return `${time} today`;
  const day = when.toLocaleDateString('en-US', { weekday: 'short', timeZone });
  return `${time} ${day}`;
}

// -- the link -------------------------------------------------------------------

/**
 * A signed, unguessable, non-sequential offer token.
 *
 * THREE PROPERTIES, and each one is load-bearing:
 *
 *   1. UNGUESSABLE — 32 random bytes. There is no id, no counter and no account
 *      identifier in the URL, so a sub holding one link learns nothing about
 *      any other offer and cannot walk to one.
 *   2. SIGNED — an HMAC suffix keyed on a server-only secret. A malformed or
 *      invented token is rejected by arithmetic before any database read
 *      happens, which keeps a scraper off the offers table entirely.
 *   3. HASHED AT REST — only sha256(secret) is stored. Somebody who reads the
 *      database cannot reconstruct a working link into a live job offer.
 *
 * Expiry is not in the token, deliberately. It lives on the request, where the
 * owner can extend or reopen it — an expiry baked into a URL cannot be changed
 * without invalidating a link somebody already has in their texts.
 */
function offerSecret(): string {
  // Domain-separated so this HMAC cannot collide with the unsubscribe token's
  // use of the same key. Same pattern as lib/email-suppression.
  return `lgq-sub-offer:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signOfferSecret(secret: string): string {
  return b64url(createHmac('sha256', offerSecret()).update(secret).digest()).slice(0, 22);
}

export function createOfferToken(): { token: string; tokenHash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { token: `${secret}.${signOfferSecret(secret)}`, tokenHash: hashSecret(secret) };
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * The stored hash for a token, or null when the signature does not check out.
 *
 * Null rather than a hash-of-garbage: a lookup that cannot possibly match is
 * still a database round trip, and the point of signing is not to make one.
 */
export function hashOfferToken(token: string | null | undefined): string | null {
  const secret = offerTokenSecret(token);
  return secret === null ? null : hashSecret(secret);
}

/** The random half, or null when the signature does not check out. */
export function offerTokenSecret(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const secret = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signOfferSecret(secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return secret;
}

/** True when this string could be one of ours. Cheap; no database involved. */
export function isValidOfferToken(token: string | null | undefined): boolean {
  return offerTokenSecret(token) !== null;
}

export function offerLink(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return `${base}/sub/${token}`;
}

// -- what a subcontractor is allowed to see -----------------------------------------

/**
 * The public view of an offer, and the single place the privacy rule lives.
 *
 * BEFORE ACCEPTANCE a stranger holding a link sees the work, the area, the day,
 * the money and the requirements — and nothing that identifies the household.
 * No street address, no customer name, no phone number, no email. Not hidden by
 * CSS and not omitted by the template: never put in the object at all, because
 * a field that reaches the page is a field one careless render away from being
 * on it.
 *
 * AFTER ACCEPTANCE the winner gets the address and the contact, because they
 * now have to drive there.
 */
export type PublicOfferView = {
  businessName: string;
  jobTitle: string;
  scope: string;
  generalLocation: string;
  distanceMiles: number | null;
  scheduleLabel: string;
  payLabel: string;
  payKind: 'fixed' | 'hourly' | 'day_rate';
  requirements: string[];
  expiresAt: string;
  selectionMode: SelectionMode;
  offerStatus: OfferStatus;
  requestStatus: RequestStatus;
  /** Present ONLY once this offer is the accepted one. */
  authorized: {
    address: string | null;
    clientName: string;
    clientPhone: string | null;
    jobRef: string;
    ownerPhone: string | null;
  } | null;
};

export function requirementLines(request: Pick<DispatchRequest,
  'requiredTrade' | 'requiredSkills' | 'requiresLicense' | 'requiresInsurance'>): string[] {
  const lines: string[] = [];
  if (request.requiredTrade) lines.push(request.requiredTrade);
  for (const skill of request.requiredSkills) lines.push(skill);
  if (request.requiresLicense) lines.push('Valid trade license');
  if (request.requiresInsurance) lines.push('Current liability insurance');
  return lines;
}

/** What the public page may say about where the offer stands. */
export type OfferOutcomeView =
  | { kind: 'open' }
  | { kind: 'accepted' }
  | { kind: 'interested' }
  | { kind: 'declined' }
  | { kind: 'claimed' }
  | { kind: 'expired' }
  | { kind: 'cancelled' };

export function offerOutcome(
  offer: Pick<DispatchOffer, 'status'>,
  request: Pick<DispatchRequest, 'status' | 'expiresAt' | 'selectionMode'>,
  now: Date = new Date(),
): OfferOutcomeView {
  if (offer.status === 'accepted') {
    // In collect-interest mode an acceptance is a hand up, not a claim — until
    // the owner picks, and picking is what sets the request to 'claimed'. A
    // firm the owner did NOT pick has been marked covered, so an accepted offer
    // on a claimed request can only belong to the winner.
    return request.selectionMode === 'collect_interest' && request.status !== 'claimed'
      ? { kind: 'interested' }
      : { kind: 'accepted' };
  }
  if (offer.status === 'declined') return { kind: 'declined' };
  if (offer.status === 'covered') return { kind: 'claimed' };
  if (request.status === 'cancelled') return { kind: 'cancelled' };
  if (request.status === 'claimed') return { kind: 'claimed' };
  if (new Date(request.expiresAt).getTime() <= now.getTime() || offer.status === 'expired') return { kind: 'expired' };
  return { kind: 'open' };
}

/** The one sentence somebody who arrived second must be shown. */
export const ALREADY_CLAIMED_MESSAGE = 'This job has already been claimed.';
