import { haversineMiles, type LatLng, minutesFromMiles } from '@/lib/distance';

export type RescheduleSlotId = 'morning' | 'afternoon' | 'evening';

export type RescheduleSlotDef = {
  id: RescheduleSlotId;
  label: string;
  timeRange: string;
  startHour: number;
  endHour: number;
};

export const RESCHEDULE_SLOTS: Record<RescheduleSlotId, RescheduleSlotDef> = {
  morning: {
    id: 'morning',
    label: 'Morning Window',
    timeRange: '8:00 AM – 12:00 PM',
    startHour: 8,
    endHour: 12,
  },
  afternoon: {
    id: 'afternoon',
    label: 'Afternoon Window',
    timeRange: '12:00 PM – 4:00 PM',
    startHour: 12,
    endHour: 16,
  },
  evening: {
    id: 'evening',
    label: 'Late Afternoon',
    timeRange: '4:00 PM – 7:00 PM',
    startHour: 16,
    endHour: 19,
  },
};

export type RescheduleWindow = {
  id: string;
  date: string;
  dateLabel: string;
  slot: RescheduleSlotId;
  slotLabel: string;
  timeRange: string;
  isAvailable: boolean;
};

export type RescheduleValidationResult = {
  allowed: boolean;
  reason?: string;
};

export type LiveArrivalEtaResult = {
  status: 'on_schedule' | 'arriving_early' | 'running_late' | 'arrived';
  distanceMiles: number;
  estimatedDriveMinutes: number;
  estimatedArrivalLabel: string;
  varianceMinutes: number;
  progressPct: number;
  headline: string;
  tone: 'success' | 'warn' | 'neutral';
};

export const DEFAULT_MIN_NOTICE_HOURS = 2;

/**
 * Calculates open rescheduling windows for the next N business days.
 */
export function calculateAvailableRescheduleWindows(params: {
  startDate?: string;
  daysCount?: number;
  maxBookingsPerSlot?: number;
  bookedSlots?: Record<string, number>; // key: "YYYY-MM-DD_slot", value: count
}): RescheduleWindow[] {
  const start = params.startDate ? new Date(params.startDate) : new Date();
  const daysCount = params.daysCount || 5;
  const maxCapacity = params.maxBookingsPerSlot || 3;
  const booked = params.bookedSlots || {};

  const windows: RescheduleWindow[] = [];

  for (let d = 1; d <= daysCount + 4 && windows.length < daysCount * 3; d++) {
    const current = new Date(start.getTime() + d * 86_400_000);
    const dayOfWeek = current.getDay();

    // Skip Sundays (0) unless specifically requested
    if (dayOfWeek === 0) continue;

    const dateStr = current.toISOString().split('T')[0];
    const dateLabel = current.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    for (const slotKey of Object.keys(RESCHEDULE_SLOTS) as RescheduleSlotId[]) {
      const slotDef = RESCHEDULE_SLOTS[slotKey];
      const windowKey = `${dateStr}_${slotKey}`;
      const count = booked[windowKey] || 0;
      const isAvailable = count < maxCapacity;

      windows.push({
        id: windowKey,
        date: dateStr,
        dateLabel,
        slot: slotKey,
        slotLabel: slotDef.label,
        timeRange: slotDef.timeRange,
        isAvailable,
      });
    }
  }

  return windows;
}

/**
 * Enforces business rules (minimum notice hours, validity) on client reschedule requests.
 */
export function validateRescheduleRequest(params: {
  currentScheduledAt: string | null;
  requestedDate: string;
  requestedSlot: RescheduleSlotId;
  now?: Date;
  minNoticeHours?: number;
}): RescheduleValidationResult {
  const now = params.now || new Date();
  const minNoticeHours = params.minNoticeHours ?? DEFAULT_MIN_NOTICE_HOURS;

  const slotDef = RESCHEDULE_SLOTS[params.requestedSlot];
  if (!slotDef) {
    return { allowed: false, reason: 'Invalid time slot selected.' };
  }

  // Parse target appointment start time
  const targetDate = new Date(`${params.requestedDate}T${String(slotDef.startHour).padStart(2, '0')}:00:00`);
  if (isNaN(targetDate.getTime())) {
    return { allowed: false, reason: 'Invalid appointment date format.' };
  }

  // Must be in the future
  if (targetDate.getTime() <= now.getTime()) {
    return { allowed: false, reason: 'Cannot reschedule to a time in the past.' };
  }

  // Check minimum notice if appointment is scheduled today
  if (params.currentScheduledAt) {
    const currentStart = new Date(params.currentScheduledAt).getTime();
    if (!isNaN(currentStart)) {
      const hoursUntilCurrent = (currentStart - now.getTime()) / 3_600_000;
      if (hoursUntilCurrent > 0 && hoursUntilCurrent < minNoticeHours) {
        return {
          allowed: false,
          reason: `Self-service rescheduling requires at least ${minNoticeHours} hours notice prior to your scheduled arrival window. Please call us directly.`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Calculates live driving ETA and progress percentage toward destination.
 */
export function calculateLiveArrivalEta(params: {
  technicianCoord: LatLng;
  destinationCoord: LatLng;
  promisedStartIso?: string | null;
  promisedEndIso?: string | null;
  now?: Date;
}): LiveArrivalEtaResult {
  const now = params.now || new Date();
  const distanceMiles = Math.round(haversineMiles(params.technicianCoord, params.destinationCoord) * 10) / 10;
  const driveMinutes = minutesFromMiles(distanceMiles);

  const etaDate = new Date(now.getTime() + driveMinutes * 60_000);
  const arrivalTimeStr = etaDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (distanceMiles <= 0.05) {
    return {
      status: 'arrived',
      distanceMiles: 0,
      estimatedDriveMinutes: 0,
      estimatedArrivalLabel: 'Arrived on site',
      varianceMinutes: 0,
      progressPct: 100,
      headline: 'Technician has arrived at your address',
      tone: 'success',
    };
  }

  let status: LiveArrivalEtaResult['status'] = 'on_schedule';
  let tone: LiveArrivalEtaResult['tone'] = 'success';
  let varianceMinutes = 0;
  let headline = `Estimated arrival at ${arrivalTimeStr} (~${driveMinutes} mins away)`;

  if (params.promisedEndIso) {
    const promisedEndMs = new Date(params.promisedEndIso).getTime();
    if (!isNaN(promisedEndMs)) {
      varianceMinutes = Math.round((etaDate.getTime() - promisedEndMs) / 60_000);
      if (varianceMinutes > 15) {
        status = 'running_late';
        tone = 'warn';
        headline = `Running ~${varianceMinutes} mins behind due to traffic. New ETA: ${arrivalTimeStr}`;
      }
    }
  }

  if (params.promisedStartIso) {
    const promisedStartMs = new Date(params.promisedStartIso).getTime();
    if (!isNaN(promisedStartMs)) {
      const earlyMins = Math.round((promisedStartMs - etaDate.getTime()) / 60_000);
      if (earlyMins > 20) {
        status = 'arriving_early';
        tone = 'neutral';
        headline = `Technician is running ahead of schedule! Expected around ${arrivalTimeStr}`;
      }
    }
  }

  // Approximate progress: 10 miles away = 10% progress, 0.5 miles away = 95% progress
  const progressPct = Math.min(95, Math.max(10, Math.round(100 - distanceMiles * 8)));

  return {
    status,
    distanceMiles,
    estimatedDriveMinutes: driveMinutes,
    estimatedArrivalLabel: `ETA ~${arrivalTimeStr}`,
    varianceMinutes,
    progressPct,
    headline,
    tone,
  };
}
