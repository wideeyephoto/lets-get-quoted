// Warranty and service history.
//
// The relationship doesn't end when the invoice is paid. Two years on, a
// homeowner has a problem and can't remember who did the work or what was
// covered — so they call somebody else. This is the record that prevents that.
//
// It's worth as much to the contractor: "that's outside your warranty" is only
// defensible when there is a dated document saying so, and "we told you it needs
// servicing annually" is only true if it was written down where they could see it.
//
// Pure half — dates and status, no database — so the rules about what is covered
// when can be pinned by tests instead of discovered in an argument.

export type WarrantyStatus = 'active' | 'expiring' | 'expired' | 'lifetime';

export type Warranty = {
  id: string;
  jobId: string;
  clientId: string | null;
  title: string;
  covers: string;
  excludes: string;
  startsOn: string;
  /** Null means no end date — a lifetime or transferable warranty. */
  endsOn: string | null;
  documentPaths: string[];
  maintenanceNotes: string;
  serviceIntervalMonths: number | null;
  nextServiceDue: string | null;
  lastServiceOn: string | null;
  serviceRemindedAt: string | null;
};

/** Inside this many days of expiry, a homeowner should be told. */
export const EXPIRING_SOON_DAYS = 60;
/** How far ahead a service is worth a reminder. */
export const SERVICE_REMINDER_DAYS = 21;

export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(fromKey: string, toKey: string): number | null {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Add months to a date key, clamping to the end of the target month.
 *
 * JavaScript's Date rolls 31 January + 1 month into 3 March, which would put a
 * warranty's end date in the wrong month and silently give away two days of
 * cover — or take them, which is worse.
 */
export function addMonths(dateKey: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function warrantyStatus(warranty: Pick<Warranty, 'startsOn' | 'endsOn'>, today = todayKey()): WarrantyStatus {
  if (!warranty.endsOn) return 'lifetime';
  const remaining = daysBetween(today, warranty.endsOn);
  if (remaining === null) return 'active';
  // The last day is INSIDE the warranty. Off-by-one here is the difference
  // between honouring a claim and refusing one.
  if (remaining < 0) return 'expired';
  if (remaining <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'active';
}

export function isInWarranty(warranty: Pick<Warranty, 'startsOn' | 'endsOn'>, onDate = todayKey()): boolean {
  const started = daysBetween(warranty.startsOn, onDate);
  if (started === null || started < 0) return false;
  if (!warranty.endsOn) return true;
  const remaining = daysBetween(onDate, warranty.endsOn);
  return remaining !== null && remaining >= 0;
}

export const WARRANTY_STATUS_LABEL: Record<WarrantyStatus, string> = {
  active: 'In warranty',
  expiring: 'Expiring soon',
  expired: 'Warranty ended',
  lifetime: 'No end date',
};

/** Plain words for a homeowner. Never a bare date they have to do maths on. */
export function warrantyRemainingLabel(warranty: Pick<Warranty, 'startsOn' | 'endsOn'>, today = todayKey()): string {
  if (!warranty.endsOn) return 'Covered with no end date.';
  const remaining = daysBetween(today, warranty.endsOn);
  if (remaining === null) return '';
  if (remaining < 0) {
    const ago = Math.abs(remaining);
    return ago < 60 ? `Ended ${ago} day${ago === 1 ? '' : 's'} ago.` : `Ended ${Math.round(ago / 30)} months ago.`;
  }
  if (remaining === 0) return 'Ends today.';
  if (remaining < 45) return `${remaining} day${remaining === 1 ? '' : 's'} left.`;
  const months = Math.round(remaining / 30);
  if (months < 24) return `About ${months} months left.`;
  return `About ${Math.floor(months / 12)} years left.`;
}

// -- Service schedule ---------------------------------------------------------

export type ServiceDue = { due: boolean; overdue: boolean; dueOn: string | null; daysAway: number | null; label: string };

/**
 * Whether a service is due, and how that reads.
 *
 * Quiet when no interval is set — most jobs never need servicing, and a system
 * that nags about every one of them gets muted for the few that matter.
 */
export function serviceDue(warranty: Pick<Warranty, 'serviceIntervalMonths' | 'nextServiceDue'>, today = todayKey()): ServiceDue {
  if (!warranty.serviceIntervalMonths || !warranty.nextServiceDue) {
    return { due: false, overdue: false, dueOn: null, daysAway: null, label: '' };
  }
  const daysAway = daysBetween(today, warranty.nextServiceDue);
  if (daysAway === null) return { due: false, overdue: false, dueOn: null, daysAway: null, label: '' };
  const overdue = daysAway < 0;
  const due = daysAway <= SERVICE_REMINDER_DAYS;
  const label = overdue
    ? `Service was due ${Math.abs(daysAway)} day${Math.abs(daysAway) === 1 ? '' : 's'} ago.`
    : daysAway === 0
      ? 'Service is due today.'
      : `Service due in ${daysAway} day${daysAway === 1 ? '' : 's'}.`;
  return { due, overdue, dueOn: warranty.nextServiceDue, daysAway, label };
}

/** The next date after a service is recorded. Counted from the service, not from today. */
export function nextServiceAfter(servicedOn: string, intervalMonths: number | null): string | null {
  if (!intervalMonths || intervalMonths <= 0) return null;
  return addMonths(servicedOn, intervalMonths);
}

// -- Claims -------------------------------------------------------------------

export type ClaimStatus = 'open' | 'scheduled' | 'resolved' | 'declined';

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'Reported',
  scheduled: 'Visit booked',
  resolved: 'Sorted',
  declined: 'Not covered',
};

/**
 * Whether a claim raised today would be inside the warranty.
 *
 * Snapshotted onto the claim, deliberately. Whether the work was covered ON THE
 * DAY THEY REPORTED IT must not change because a date rolled by while the
 * contractor took a week to get back to them.
 */
export function claimIsInWarranty(warranty: Pick<Warranty, 'startsOn' | 'endsOn'>, reportedOn = todayKey()): boolean {
  return isInWarranty(warranty, reportedOn);
}

// -- Client-facing ------------------------------------------------------------

export type ClientWarranty = {
  id: string;
  title: string;
  covers: string;
  excludes: string;
  startsOn: string;
  endsOn: string | null;
  status: WarrantyStatus;
  statusLabel: string;
  remainingLabel: string;
  maintenanceNotes: string;
  documentCount: number;
  documentUrls?: Array<{ name: string; url: string }>;
  serviceDueLabel: string;
  /** They can still ask even when it's expired — the contractor decides. */
  canClaim: boolean;
};

/**
 * What the homeowner sees.
 *
 * `canClaim` stays TRUE on an expired warranty. A homeowner whose sealant failed
 * three weeks after cover ended should be able to ask; a contractor who wants
 * the work, or who knows it's a genuine defect, will often say yes. Hiding the
 * button decides on their behalf and loses both of them the conversation.
 */
export function toClientWarranties(
  warranties: Warranty[],
  today = todayKey(),
  docUrlsMap: Record<string, Array<{ name: string; url: string }>> = {},
): ClientWarranty[] {
  return warranties.map((warranty) => {
    const status = warrantyStatus(warranty, today);
    const service = serviceDue(warranty, today);
    return {
      id: warranty.id,
      title: warranty.title,
      covers: warranty.covers,
      excludes: warranty.excludes,
      startsOn: warranty.startsOn,
      endsOn: warranty.endsOn,
      status,
      statusLabel: WARRANTY_STATUS_LABEL[status],
      remainingLabel: warrantyRemainingLabel(warranty, today),
      maintenanceNotes: warranty.maintenanceNotes,
      documentCount: warranty.documentPaths.length,
      documentUrls: docUrlsMap[warranty.id] ?? [],
      serviceDueLabel: service.label,
      canClaim: true,
    };
  });
}

/** Warranties needing a service reminder. Ordered by how overdue they are. */
export function warrantiesDueForService(warranties: Warranty[], today = todayKey()): Warranty[] {
  return warranties
    .map((warranty) => ({ warranty, due: serviceDue(warranty, today) }))
    .filter((entry) => entry.due.due)
    .sort((a, b) => (a.due.daysAway ?? 0) - (b.due.daysAway ?? 0))
    .map((entry) => entry.warranty);
}
