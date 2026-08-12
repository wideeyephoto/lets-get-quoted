import { addDaysToDateKey, weekdayOfDateKey } from '@/lib/jobs';
import { haversineMiles, type LatLng } from '@/lib/distance';

/**
 * Where a job could go, and why.
 *
 * THE OLD FORM ASKED A QUESTION IT ALREADY KNEW THE ANSWER TO. Scheduling a job
 * meant opening a date picker and a time picker on an empty card and typing a
 * date — with the capacity map, the working week, the blocked days and the
 * booked hours all sitting one component away, unconsulted. Four quick presets
 * sat under it ("Today 8 AM", "Next Mon 8 AM") which were the same guess every
 * time and knew nothing about whether those days were already full.
 *
 * This proposes days that actually have room, in order, with the reason
 * attached. It is a suggestion and never a decision: the manual picker is still
 * there, and picking a full day is still allowed — a contractor who wants to
 * squeeze a call into a booked Tuesday knows something this file does not.
 *
 * PURE, AND HERE RATHER THAN IN THE COMPONENT, because the interesting parts
 * are the edges — a job longer than a whole day, a week with every day blocked,
 * an estimate nobody has entered — and those are worth being able to state in a
 * test rather than click through.
 */

export type SuggestedSlot = {
  dateKey: string;
  /** 24h "08:00", ready for a <select> or an input value. */
  time: string;
  /** Why this day: "Nothing booked yet", "3h free after 2 jobs". */
  reason: string;
  /** Straight-line miles to the nearest job already on that day, when both
   *  ends have coordinates. Null is "cannot say", never "nearby". */
  milesFromDayWork: number | null;
  bookedHours: number;
  capacityHours: number;
};

export type SuggestInput = {
  /** Today in the account's timezone. Suggestions start the day AFTER. */
  todayKey: string;
  /** How long the job takes, or null when nobody has said. */
  jobHours: number | null;
  /** Where the job is, for the proximity note. Null when it has no address. */
  jobAt: LatLng | null;
  /** Booked hours per date, buffer included — the same map the calendar draws. */
  hoursByDate: Record<string, number>;
  /** Jobs per date, so a day with work but no hours still reads as busy. */
  jobsByDate: Record<string, number>;
  /** Coordinates of what is already booked on each date. */
  placesByDate: Record<string, LatLng[]>;
  capacityHours: number;
  /** Date key -> why the day is off. Availability blocks ONLY: a day that is
   *  merely full is a day this function is allowed to rank lower, not skip. */
  blockedDays: Record<string, string>;
  /** 0=Sun … 6=Sat. Empty means "not configured", which is not "never works". */
  workingWeekdays: number[];
  /** "07:30". The first hour of the day, and where an empty day starts. */
  workdayStart: string | null;
  lookaheadDays?: number;
  limit?: number;
};

const DEFAULT_LOOKAHEAD = 45;
const DEFAULT_LIMIT = 3;

/** "08:00" -> 480. Anything unparseable falls back to 8am rather than to zero,
 *  which would propose a midnight start. */
function startMinutes(value: string | null): number {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? '').trim());
  if (!match) return 8 * 60;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return 8 * 60;
  return hours * 60 + minutes;
}

function toClock(totalMinutes: number): string {
  // Past midnight is not a start time anybody wants offered; clamp rather than
  // wrap, because wrapping would propose 1am on the same date.
  const clamped = Math.max(0, Math.min(23 * 60 + 30, totalMinutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Up to the next half hour. An arrival at 11:06 is a time nobody says out loud. */
function roundUpToHalfHour(minutes: number): number {
  return Math.ceil(minutes / 30) * 30;
}

function hoursText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

export function suggestSlots(input: SuggestInput): SuggestedSlot[] {
  const capacity = input.capacityHours > 0 ? input.capacityHours : 8;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const lookahead = input.lookaheadDays ?? DEFAULT_LOOKAHEAD;
  const working = input.workingWeekdays.length > 0 ? new Set(input.workingWeekdays) : null;
  const dayStart = startMinutes(input.workdayStart);

  /* A JOB LONGER THAN A DAY STILL NEEDS A FIRST DAY.
     Requiring `capacity - booked >= jobHours` would return nothing at all for a
     three-day job on an eight-hour day — the correct answer is "start it on the
     first clear day", and the span takes care of itself. So the room a day must
     have is the job, or a whole day, whichever is less. */
  const needed = input.jobHours != null && input.jobHours > 0 ? Math.min(input.jobHours, capacity) : null;

  const slots: SuggestedSlot[] = [];

  // From TOMORROW. Offering this afternoon as a recommendation means telling a
  // customer today, which is a different kind of decision — the manual picker
  // still allows it.
  for (let offset = 1; offset <= lookahead && slots.length < limit; offset += 1) {
    const dateKey = addDaysToDateKey(input.todayKey, offset);

    // Days off, and days deliberately blocked, are not suggestions. Both are
    // still reachable by hand.
    if (working && !working.has(weekdayOfDateKey(dateKey))) continue;
    if (input.blockedDays[dateKey]) continue;

    const booked = Math.max(0, input.hoursByDate[dateKey] ?? 0);
    const free = capacity - booked;
    // A day with no room left is not a recommendation. `needed` null — nobody
    // estimated the job — only asks that something is left.
    if (needed != null ? free < needed : free <= 0) continue;

    const jobCount = input.jobsByDate[dateKey] ?? 0;
    const places = input.placesByDate[dateKey] ?? [];
    const milesFromDayWork = input.jobAt && places.length > 0
      ? Math.round(Math.min(...places.map((place) => haversineMiles(input.jobAt as LatLng, place))) * 10) / 10
      : null;

    slots.push({
      dateKey,
      // An empty day starts at the top; a part-booked one starts after what is
      // already there, which is the same arithmetic the day planner does.
      time: toClock(jobCount === 0 ? dayStart : roundUpToHalfHour(dayStart + booked * 60)),
      reason: jobCount === 0
        ? 'Nothing booked yet'
        : `${hoursText(free)} free after ${jobCount} ${jobCount === 1 ? 'job' : 'jobs'}`,
      milesFromDayWork,
      bookedHours: booked,
      capacityHours: capacity,
    });
  }

  return slots;
}

/**
 * What the flow will not let you skip.
 *
 * "Save Start Date" was always enabled — pressing it with an empty date field
 * redirected back to the queue having done nothing, which is indistinguishable
 * from the button being broken. The button is now disabled until it can work,
 * and this is the one place that decides what "can work" means.
 */
export function scheduleReady(draft: { dateKey: string | null; time: string | null }): boolean {
  return Boolean(draft.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(draft.dateKey));
}
