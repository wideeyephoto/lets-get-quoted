// A subcontractor, as this app understands one.
//
// A SUB IS A CREW ROW with worker_type='subcontractor'. See the migration for
// why (everything that already works on a person keeps working). This file is
// the reading of that row: what the columns mean, what "compliant" is, and how
// a firm's record turns into the six numbers an owner actually decides on.
//
// Pure and I/O-free. Every judgement here — is that insurance expired, is a 60%
// acceptance rate good, has this firm ever finished anything — is testable
// without a database, and the dispatch page, the roster and the public offer
// page all reach the same verdict because they all call these functions.

import type { CrewMember } from '@/lib/crew';

// -- worker type ---------------------------------------------------------------

export const WORKER_TYPES = ['employee', 'subcontractor'] as const;
export type WorkerType = (typeof WORKER_TYPES)[number];

export const WORKER_TYPE_LABEL: Record<WorkerType, string> = {
  employee: 'Employee',
  subcontractor: 'Subcontractor',
};

/**
 * Anything that is not the literal string 'subcontractor' is an employee.
 *
 * Defaulting the OTHER way would silently reclassify every person on every
 * roster that pre-dates this column, and an employee shown as a subcontractor
 * is a tax question, not a display bug.
 */
export function normalizeWorkerType(value: unknown): WorkerType {
  return value === 'subcontractor' ? 'subcontractor' : 'employee';
}

// -- where the firm stands ------------------------------------------------------

export const SUB_STATUSES = ['preferred', 'active', 'backup', 'archived'] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  preferred: 'Preferred',
  active: 'Active',
  backup: 'Backup',
  archived: 'Archived',
};

export const SUB_STATUS_HINT: Record<SubStatus, string> = {
  preferred: 'Called first, and recommended at the top of every match list.',
  active: 'On the list and offered work like anybody else.',
  backup: 'Offered work only when the preferred and active firms cannot cover it.',
  archived: 'Kept for the record. Never suggested and never sent an offer.',
};

export function normalizeSubStatus(value: unknown): SubStatus {
  return (SUB_STATUSES as readonly string[]).includes(String(value)) ? (value as SubStatus) : 'active';
}

/** Rank for sorting a match list. Lower is offered work sooner. */
export const SUB_STATUS_RANK: Record<SubStatus, number> = {
  preferred: 0,
  active: 1,
  backup: 2,
  archived: 3,
};

// -- how they price -------------------------------------------------------------

export const RATE_PREFERENCES = ['fixed', 'hourly', 'day_rate'] as const;
export type RatePreference = (typeof RATE_PREFERENCES)[number];

export const RATE_PREFERENCE_LABEL: Record<RatePreference, string> = {
  fixed: 'Fixed price per job',
  hourly: 'Hourly',
  day_rate: 'Day rate',
};

export function normalizeRatePreference(value: unknown): RatePreference {
  return (RATE_PREFERENCES as readonly string[]).includes(String(value)) ? (value as RatePreference) : 'fixed';
}

// -- paperwork ------------------------------------------------------------------

export const W9_STATUSES = ['missing', 'requested', 'on_file'] as const;
export type W9Status = (typeof W9_STATUSES)[number];
export const W9_STATUS_LABEL: Record<W9Status, string> = {
  missing: 'No W-9',
  requested: 'W-9 requested',
  on_file: 'W-9 on file',
};

export const AGREEMENT_STATUSES = ['missing', 'sent', 'signed'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  missing: 'No agreement',
  sent: 'Agreement sent',
  signed: 'Agreement signed',
};

export function normalizeW9Status(value: unknown): W9Status {
  return (W9_STATUSES as readonly string[]).includes(String(value)) ? (value as W9Status) : 'missing';
}

export function normalizeAgreementStatus(value: unknown): AgreementStatus {
  return (AGREEMENT_STATUSES as readonly string[]).includes(String(value)) ? (value as AgreementStatus) : 'missing';
}

// -- the profile, shaped --------------------------------------------------------

/**
 * The subcontractor columns on a crew row, read defensively.
 *
 * Every field is optional on the input type for the same reason the rest of
 * lib/crew's are: a deploy that lands before its migration reads rows without
 * these columns, and a directory that throws is worse than one that shows a
 * firm with no trades listed.
 */
export type SubcontractorProfile = {
  workerType: WorkerType;
  companyName: string | null;
  trades: string[];
  skills: string[];
  tags: string[];
  serviceArea: string | null;
  travelRadiusMiles: number | null;
  availabilityNote: string | null;
  emergencyAvailable: boolean;
  ratePreference: RatePreference;
  hourlyRate: number;
  dayRate: number | null;
  minimumCharge: number | null;
  licenseNumber: string | null;
  licenseExpiresOn: string | null;
  insuranceCarrier: string | null;
  insuranceExpiresOn: string | null;
  w9Status: W9Status;
  agreementStatus: AgreementStatus;
  paymentTerms: string | null;
  internalNotes: string | null;
  subStatus: SubStatus;
};

type ProfileRow = Partial<CrewMember> & Record<string, unknown>;

function textOf(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  // Postgres arrays arrive as arrays through PostgREST, but a form posts a
  // comma-separated string and a legacy row could hold either.
  const text = textOf(value);
  if (!text) return [];
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shapeSubcontractorProfile(row: ProfileRow): SubcontractorProfile {
  return {
    workerType: normalizeWorkerType(row.worker_type),
    companyName: textOf(row.company_name),
    trades: listOf(row.trades),
    skills: listOf(row.skills),
    tags: listOf(row.tags),
    serviceArea: textOf(row.service_area),
    travelRadiusMiles: numberOf(row.travel_radius_miles),
    availabilityNote: textOf(row.availability_note),
    emergencyAvailable: row.emergency_available === true,
    ratePreference: normalizeRatePreference(row.rate_preference),
    hourlyRate: numberOf(row.hourly_rate) ?? 0,
    dayRate: numberOf(row.day_rate),
    minimumCharge: numberOf(row.minimum_charge),
    licenseNumber: textOf(row.license_number),
    licenseExpiresOn: textOf(row.license_expires_on),
    insuranceCarrier: textOf(row.insurance_carrier),
    insuranceExpiresOn: textOf(row.insurance_expires_on),
    w9Status: normalizeW9Status(row.w9_status),
    agreementStatus: normalizeAgreementStatus(row.agreement_status),
    paymentTerms: textOf(row.payment_terms),
    internalNotes: textOf(row.internal_notes),
    subStatus: normalizeSubStatus(row.sub_status),
  };
}

/** The name to put on a row: the firm if there is one, otherwise the person. */
export function subDisplayName(name: string, companyName: string | null): string {
  const company = (companyName ?? '').trim();
  return company || name;
}

// -- compliance -----------------------------------------------------------------

export type ComplianceState = 'ok' | 'expiring' | 'expired' | 'missing';

export type ComplianceItem = {
  id: 'license' | 'insurance' | 'paperwork';
  label: string;
  state: ComplianceState;
  detail: string;
};

export type Compliance = {
  overall: ComplianceState;
  label: string;
  items: ComplianceItem[];
  /** Can this firm legally be sent a job that demands a license/insurance? */
  licenseOk: boolean;
  insuranceOk: boolean;
};

/**
 * How close to expiry counts as "renew this".
 *
 * Thirty days, because a certificate that lapses mid-job is the expensive
 * version of this problem: the sub is on site, the work is half done, and the
 * cover that was in place when they were hired is not in place when something
 * goes wrong.
 */
export const COMPLIANCE_WARNING_DAYS = 30;

const STATE_RANK: Record<ComplianceState, number> = { ok: 0, expiring: 1, missing: 2, expired: 3 };

function dateState(hasRecord: boolean, expiresOn: string | null, today: string): ComplianceState {
  if (!hasRecord) return 'missing';
  if (!expiresOn) return 'ok';
  if (expiresOn < today) return 'expired';
  const warnFrom = new Date(`${today}T00:00:00Z`);
  warnFrom.setUTCDate(warnFrom.getUTCDate() + COMPLIANCE_WARNING_DAYS);
  return expiresOn <= warnFrom.toISOString().slice(0, 10) ? 'expiring' : 'ok';
}

function expiryDetail(state: ComplianceState, expiresOn: string | null, noun: string): string {
  if (state === 'missing') return `No ${noun} on file`;
  if (state === 'expired') return `${noun} expired ${expiresOn}`;
  if (state === 'expiring') return `${noun} expires ${expiresOn}`;
  return expiresOn ? `${noun} good to ${expiresOn}` : `${noun} on file`;
}

const OVERALL_LABEL: Record<ComplianceState, string> = {
  ok: 'Compliant',
  expiring: 'Expiring soon',
  expired: 'Expired',
  missing: 'Incomplete',
};

/**
 * Licence, insurance and paperwork, and the worst of the three.
 *
 * `today` is passed in rather than read from the clock so this is a pure
 * function and so a server rendering in UTC and a browser in Detroit cannot
 * disagree about whether a certificate expired today.
 */
export function complianceFor(profile: SubcontractorProfile, today: string): Compliance {
  const license = dateState(Boolean(profile.licenseNumber), profile.licenseExpiresOn, today);
  const insurance = dateState(Boolean(profile.insuranceCarrier), profile.insuranceExpiresOn, today);

  const paperworkMissing =
    (profile.w9Status !== 'on_file' ? 1 : 0) + (profile.agreementStatus !== 'signed' ? 1 : 0);
  const paperwork: ComplianceState = paperworkMissing === 0 ? 'ok' : 'missing';

  const items: ComplianceItem[] = [
    { id: 'license', label: 'License', state: license, detail: expiryDetail(license, profile.licenseExpiresOn, 'License') },
    {
      id: 'insurance',
      label: 'Insurance',
      state: insurance,
      detail: expiryDetail(insurance, profile.insuranceExpiresOn, 'Insurance'),
    },
    {
      id: 'paperwork',
      label: 'Paperwork',
      state: paperwork,
      detail:
        paperwork === 'ok'
          ? 'W-9 and agreement on file'
          : [profile.w9Status !== 'on_file' ? W9_STATUS_LABEL[profile.w9Status] : null,
             profile.agreementStatus !== 'signed' ? AGREEMENT_STATUS_LABEL[profile.agreementStatus] : null]
              .filter(Boolean)
              .join(' · '),
    },
  ];

  const overall = items.reduce<ComplianceState>(
    (worst, item) => (STATE_RANK[item.state] > STATE_RANK[worst] ? item.state : worst),
    'ok',
  );

  return {
    overall,
    label: OVERALL_LABEL[overall],
    items,
    // Expiring is still cover. Expired and missing are not — and this is the
    // half of the answer that decides whether an offer may be sent at all.
    licenseOk: license === 'ok' || license === 'expiring',
    insuranceOk: insurance === 'ok' || insurance === 'expiring',
  };
}

// -- performance ----------------------------------------------------------------

/** One offer, reduced to what a metric needs. */
export type OfferOutcome = {
  status: string;
  sentAt: string | null;
  respondedAt: string | null;
};

export type ReviewScores = {
  workQuality: number;
  communication: number;
  onTime: number;
  cleanliness: number;
  withinPrice: boolean;
  hireAgain: boolean;
};

export type SubMetrics = {
  offered: number;
  accepted: number;
  declined: number;
  completed: number;
  /** Median, not mean — see below. Null when nobody has ever answered. */
  responseMinutes: number | null;
  /** 0–1, or null when they have never been offered anything. */
  acceptanceRate: number | null;
  /** 1–5 average of the four scored dimensions, across every review. */
  rating: number | null;
  reviewCount: number;
  hireAgainRate: number | null;
};

/**
 * The MEDIAN response time, deliberately.
 *
 * A mean is destroyed by one offer somebody opened the next morning: four
 * two-minute replies and one nine-hour one average to nearly two hours, which
 * describes none of the five and would push a genuinely fast firm below a slow
 * one in the match list. The median says what usually happens, which is the
 * question being asked.
 */
export function medianMinutes(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function subMetrics(input: {
  offers: OfferOutcome[];
  completedJobs: number;
  reviews: ReviewScores[];
}): SubMetrics {
  // 'queued' is not an offer anybody has been made yet — counting it would
  // drag an acceptance rate down for a text that has not gone out.
  const offered = input.offers.filter((offer) => offer.status !== 'queued').length;
  const accepted = input.offers.filter((offer) => offer.status === 'accepted').length;
  const declined = input.offers.filter((offer) => offer.status === 'declined').length;

  const responses: number[] = [];
  for (const offer of input.offers) {
    if (!offer.sentAt || !offer.respondedAt) continue;
    const minutes = (new Date(offer.respondedAt).getTime() - new Date(offer.sentAt).getTime()) / 60000;
    if (Number.isFinite(minutes) && minutes >= 0) responses.push(minutes);
  }

  const scored = input.reviews.flatMap((review) => [
    review.workQuality,
    review.communication,
    review.onTime,
    review.cleanliness,
  ]);

  return {
    offered,
    accepted,
    declined,
    completed: input.completedJobs,
    responseMinutes: medianMinutes(responses),
    // Answering is not the same as accepting, and the rate that matters when
    // deciding who to text is "did this turn into cover" — so the denominator
    // is everything they were actually sent.
    acceptanceRate: offered > 0 ? accepted / offered : null,
    rating: scored.length > 0 ? Math.round((scored.reduce((sum, value) => sum + value, 0) / scored.length) * 10) / 10 : null,
    reviewCount: input.reviews.length,
    hireAgainRate:
      input.reviews.length > 0
        ? input.reviews.filter((review) => review.hireAgain).length / input.reviews.length
        : null,
  };
}

/** "6m", "1h 20m", "2d" — the shape the summary cards use. */
export function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  return `${Math.round(minutes / (60 * 24))}d`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatRating(rating: number | null): string {
  return rating === null ? 'Not rated yet' : rating.toFixed(1);
}
