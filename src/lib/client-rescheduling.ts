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
