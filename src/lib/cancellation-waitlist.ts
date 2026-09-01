import { coordOf, haversineMiles, nearestMiles, type LatLng } from '@/lib/distance';
import { formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { greetingName, parseOfferReply, type OfferReply } from '@/lib/estimate-offers';
import { weekdayOfDateKey } from '@/lib/jobs';

// Cancellation Waitlist & Priority Offering Engine
//
// When an appointment is cancelled, rescheduled, or a window opens up on the route,
// this module finds qualified customers and leads waiting for an earlier date,
// calculates a transparent multi-factor priority score, and orders candidates.
//
// Pure and I/O-free: Every rule and ranking is 100% testable without database or network.

export const WAITLIST_STATUSES = ['active', 'offered', 'fulfilled', 'expired', 'removed'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const WAITLIST_WINDOWS = ['morning', 'afternoon', 'evening', 'any'] as const;
export type WaitlistWindow = (typeof WAITLIST_WINDOWS)[number];

export const WAITLIST_URGENCIES = ['emergency', 'high', 'medium', 'flexible'] as const;
export type WaitlistUrgency = (typeof WAITLIST_URGENCIES)[number];

export const WAITLIST_OFFER_STATUSES = ['pending', 'accepted', 'declined', 'expired', 'canceled'] as const;
export type WaitlistOfferStatus = (typeof WAITLIST_OFFER_STATUSES)[number];

export type WaitlistEntry = {
  id: string;
  account_id: string;
  client_id: string | null;
  job_id: string | null;
  lead_id: string | null;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  preferred_days: number[]; // 0=Sun..6=Sat
  preferred_window: WaitlistWindow;
  earliest_date: string | null;
  latest_date: string | null;
  service_name: string | null;
  estimated_hours: number;
  estimated_value: number | null;
  urgency: WaitlistUrgency;
  notes: string | null;
  status: WaitlistStatus;
  created_at: string;
  updated_at: string;
};

export type WaitlistOffer = {
  id: string;
  account_id: string;
  waitlist_entry_id: string;
  client_id: string | null;
  job_id: string | null;
  lead_id: string | null;
  opened_slot_date: string;
  window_start: string;
  window_end: string;
  arrival_time: string;
  status: WaitlistOfferStatus;
  priority_rank: number;
  priority_score: number;
  score_breakdown: CandidateScoreBreakdown;
  hold_minutes: number;
  hold_expires_at: string;
  auto_cascade: boolean;
  phone: string;
  body: string;
  sent_at: string;
  replied_at: string | null;
  reply_body: string | null;
  created_at: string;
  updated_at: string;
};

export type OpenedSlotWindow = {
  dateKey: string;
  windowStart: string; // "08:00"
  windowEnd: string;   // "12:00"
  arrivalTime?: string; // "08:00"
  durationHours?: number;
  /** Coordinates of other scheduled stops on this day for route optimization */
  anchors?: LatLng[];
};

export type CandidateScoreBreakdown = {
  proximityScore: number; // 0..35
  distanceMiles: number | null;
  waitTimeScore: number;  // 0..25
  daysWaiting: number;
  urgencyScore: number;   // 0..20
  windowFitScore: number; // 0..10
  valueScore: number;     // 0..10
  totalScore: number;     // 0..100
};

export type RankedWaitlistCandidate = {
  entry: WaitlistEntry;
  rank: number;
  score: CandidateScoreBreakdown;
  qualificationNotes: string[];
};

export const HOLD_MINUTES_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_HOLD_MINUTES = 30;
export const MAX_OFFER_BODY = 320;

// -- Qualification checks ------------------------------------------------------

export function getWindowTypeFromMinutes(startMinutes: number, endMinutes: number): WaitlistWindow {
  // 8am-12pm = morning, 12pm-4pm = afternoon, 4pm-7pm = evening
  if (startMinutes < 12 * 60 && endMinutes <= 13 * 60) return 'morning';
  if (startMinutes >= 11 * 60 && startMinutes < 16 * 60) return 'afternoon';
  if (startMinutes >= 15 * 60) return 'evening';
  return 'any';
}

export function windowMinutes(timeStr: string): number {
  const parsed = parseTimeMinutes(timeStr);
  return parsed ?? 8 * 60;
}

export function isCandidateQualified(
  entry: WaitlistEntry,
  slot: OpenedSlotWindow,
): { qualified: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (entry.status !== 'active') {
    return { qualified: false, reasons: [`Status is ${entry.status} (must be active)`] };
  }

  // Check date boundaries
  if (entry.earliest_date && slot.dateKey < entry.earliest_date) {
    return { qualified: false, reasons: [`Date ${slot.dateKey} is before earliest requested (${entry.earliest_date})`] };
  }
  if (entry.latest_date && slot.dateKey > entry.latest_date) {
    return { qualified: false, reasons: [`Date ${slot.dateKey} is after latest accepted (${entry.latest_date})`] };
  }

  // Check day of week
  if (entry.preferred_days && entry.preferred_days.length > 0) {
    const weekday = weekdayOfDateKey(slot.dateKey);
    if (!entry.preferred_days.includes(weekday)) {
      return { qualified: false, reasons: [`Day of week not in preferred days`] };
    }
  }

  // Check duration fit
  const startMin = windowMinutes(slot.windowStart);
  const endMin = windowMinutes(slot.windowEnd);
  const availableHours = slot.durationHours ?? Math.max(0.5, (endMin - startMin) / 60);

  if (entry.estimated_hours > availableHours + 0.01) {
    return {
      qualified: false,
      reasons: [`Estimated work (${entry.estimated_hours}h) exceeds window capacity (${availableHours.toFixed(1)}h)`],
    };
  }

  // Check window preference
  if (entry.preferred_window && entry.preferred_window !== 'any') {
    const slotWindow = getWindowTypeFromMinutes(startMin, endMin);
    if (slotWindow !== 'any' && slotWindow !== entry.preferred_window) {
      // If customer requested morning, but window is evening, disqualify unless urgency is emergency
      if (entry.urgency !== 'emergency') {
        return {
          qualified: false,
          reasons: [`Slot is ${slotWindow}, client requested ${entry.preferred_window}`],
        };
      }
    }
  }

  reasons.push('Matches date, day of week, and duration constraints');
  return { qualified: true, reasons };
}

// -- Scoring Engine ------------------------------------------------------------

export function calculateCandidateScore(
  entry: WaitlistEntry,
  slot: OpenedSlotWindow,
  anchors: LatLng[] = [],
  now: Date = new Date(),
): CandidateScoreBreakdown {
  // 1. Proximity Score (0..35 pts)
  let proximityScore = 15; // default neutral score
  let distanceMiles: number | null = null;
  const candidateCoord = coordOf(entry);

  if (candidateCoord && anchors.length > 0) {
    distanceMiles = nearestMiles(candidateCoord, anchors);
    if (distanceMiles !== null) {
      if (distanceMiles <= 3) proximityScore = 35;
      else if (distanceMiles <= 6) proximityScore = 28;
      else if (distanceMiles <= 12) proximityScore = 20;
      else if (distanceMiles <= 20) proximityScore = 10;
      else proximityScore = 4;
    }
  } else if (candidateCoord) {
    proximityScore = 18; // Coordinates known
  }

  // 2. Wait Time / Longevity Score (0..25 pts)
  const createdTime = new Date(entry.created_at).getTime();
  const daysWaiting = Math.max(0, Math.floor((now.getTime() - createdTime) / 86400000));
  // 5 pts per day waiting, capped at 25
  const waitTimeScore = Math.min(25, Math.max(5, (daysWaiting + 1) * 5));

  // 3. Urgency Score (0..20 pts)
  let urgencyScore = 10;
  switch (entry.urgency) {
    case 'emergency':
      urgencyScore = 20;
      break;
    case 'high':
      urgencyScore = 16;
      break;
    case 'medium':
      urgencyScore = 10;
      break;
    case 'flexible':
      urgencyScore = 5;
      break;
  }

  // 4. Window & Duration Fit (0..10 pts)
  const startMin = windowMinutes(slot.windowStart);
  const endMin = windowMinutes(slot.windowEnd);
  const availableHours = slot.durationHours ?? Math.max(0.5, (endMin - startMin) / 60);
  const slotWindow = getWindowTypeFromMinutes(startMin, endMin);

  let windowFitScore = 5;
  if (entry.preferred_window === 'any' || entry.preferred_window === slotWindow) {
    windowFitScore += 3;
  }
  // If duration utilizes 70%+ of the opened gap, high schedule efficiency
  const utilization = entry.estimated_hours / availableHours;
  if (utilization >= 0.7 && utilization <= 1.0) {
    windowFitScore += 2;
  }

  // 5. Value Score (0..10 pts)
  let valueScore = 4;
  const value = entry.estimated_value ?? 0;
  if (value >= 1500) valueScore = 10;
  else if (value >= 750) valueScore = 8;
  else if (value >= 300) valueScore = 6;

  const totalScore = Math.min(100, Math.round(proximityScore + waitTimeScore + urgencyScore + windowFitScore + valueScore));

  return {
    proximityScore,
    distanceMiles: distanceMiles !== null ? Math.round(distanceMiles * 10) / 10 : null,
    waitTimeScore,
    daysWaiting,
    urgencyScore,
    windowFitScore,
    valueScore,
    totalScore,
  };
}

/**
 * Ranks all active waitlist entries for a newly opened slot in descending priority order.
 */
export function rankWaitlistCandidates(input: {
  candidates: WaitlistEntry[];
  slot: OpenedSlotWindow;
  anchors?: LatLng[];
  now?: Date;
}): RankedWaitlistCandidate[] {
  const anchors = input.anchors ?? input.slot.anchors ?? [];
  const now = input.now ?? new Date();

  const qualified: RankedWaitlistCandidate[] = [];

  for (const entry of input.candidates) {
    const { qualified: isOk, reasons } = isCandidateQualified(entry, input.slot);
    if (!isOk) continue;

    const score = calculateCandidateScore(entry, input.slot, anchors, now);
    qualified.push({
      entry,
      rank: 0, // Assigned after sorting
      score,
      qualificationNotes: reasons,
    });
  }

  // Sort by totalScore desc, then FIFO created_at asc, then name
  qualified.sort((a, b) => {
    if (b.score.totalScore !== a.score.totalScore) {
      return b.score.totalScore - a.score.totalScore;
    }
    const timeA = new Date(a.entry.created_at).getTime();
    const timeB = new Date(b.entry.created_at).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.entry.client_name.localeCompare(b.entry.client_name);
  });

  return qualified.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

// -- Text drafting and reply handling ------------------------------------------

export function dayWord(dateKey: string, todayKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const now = new Date(ty, (tm ?? 1) - 1, td ?? 1);
  const days = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days < 7) return `this ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatWaitlistWindowLabel(windowStart: string, windowEnd: string): string {
  const start = parseTimeMinutes(windowStart);
  const end = parseTimeMinutes(windowEnd);
  if (start == null || end == null) return `${windowStart} – ${windowEnd}`;
  return `${formatTimeLabel(start)} to ${formatTimeLabel(end)}`;
}

export function draftWaitlistOfferBody(input: {
  clientName: string | null;
  dayText: string;
  windowLabel: string;
  serviceName?: string | null;
  holdMinutes: number;
}): string {
  const servicePart = input.serviceName ? ` for your ${input.serviceName.trim()}` : '';
  return (
    `Hi ${greetingName(input.clientName)} — an earlier spot opened up ${input.dayText}, ` +
    `${input.windowLabel}${servicePart}! We are holding this spot for you for the next ${input.holdMinutes} minutes.`
  );
}

export const WAITLIST_REPLY_INSTRUCTION = 'Reply YES to claim this spot or NO to stay on the waitlist.';

export function composeWaitlistOfferMessage(businessName: string, body: string): string {
  return `${businessName.trim()}: ${body.trim()} ${WAITLIST_REPLY_INSTRUCTION} Reply STOP to opt out.`;
}

export type WaitlistOfferDecision = 'accepted' | 'declined' | 'ambiguous';

export function parseWaitlistOfferReply(body: string): { decision: WaitlistOfferDecision } {
  const reply = parseOfferReply(body);
  if (reply === 'accept') return { decision: 'accepted' };
  if (reply === 'decline') return { decision: 'declined' };
  return { decision: 'ambiguous' };
}

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  active: 'Active in Queue',
  offered: 'Slot Offered',
  fulfilled: 'Booked & Fulfilled',
  expired: 'Expired',
  removed: 'Removed',
};

export const WAITLIST_URGENCY_LABELS: Record<WaitlistUrgency, string> = {
  emergency: 'Emergency (Urgent)',
  high: 'High Priority',
  medium: 'Standard',
  flexible: 'Flexible Schedule',
};
