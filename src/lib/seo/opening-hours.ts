// Free-text business hours -> schema.org OpeningHoursSpecification.
//
// The site stores hours as whatever the owner (or the AI generator) typed:
// "Mon-Fri 8am-5pm", "Mon-Fri 8am-6pm, Sat 9am-2pm". Google can only use the
// structured form, so the LocalBusiness node stayed silent about hours entirely
// — one of the few fields a homeowner actually looks for in a search result.
//
// FAILS CLOSED, and that is the whole design. If any part of the string doesn't
// parse, this returns nothing rather than a partial answer. Publishing half of
// somebody's hours is not "most of the benefit": it is telling Google the
// business is CLOSED on days it is open, in markup a search result may quote.
// Silence is recoverable, a wrong answer is not.
//
// Pure and dependency-free.

export type OpeningHoursSpec = {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[];
  opens: string;
  closes: string;
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_ALIASES: Record<string, string> = {
  mon: 'Monday', monday: 'Monday', mo: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday', tu: 'Tuesday',
  wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday', we: 'Wednesday',
  thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday', th: 'Thursday',
  fri: 'Friday', friday: 'Friday', fr: 'Friday',
  sat: 'Saturday', saturday: 'Saturday', sa: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday', su: 'Sunday',
};

function toDay(raw: string): string | null {
  return DAY_ALIASES[raw.trim().toLowerCase().replace(/\./g, '')] ?? null;
}

// "8am" | "8:30 am" | "17:00" -> "HH:MM". Null for anything else.
function toTime(raw: string): string | null {
  const match = raw.trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else if (hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// "Mon-Fri" -> all five; "Sat" -> one. Wraps the week, so "Sat-Mon" works.
function toDays(raw: string): string[] | null {
  const parts = raw.split(/\s*(?:-|–|—|to|through|thru)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    const day = toDay(parts[0]);
    return day ? [day] : null;
  }
  if (parts.length !== 2) return null;
  const from = toDay(parts[0]);
  const to = toDay(parts[1]);
  if (!from || !to) return null;
  const days: string[] = [];
  let index = DAY_ORDER.indexOf(from);
  const end = DAY_ORDER.indexOf(to);
  for (let guard = 0; guard < 7; guard += 1) {
    days.push(DAY_ORDER[index]);
    if (index === end) return days;
    index = (index + 1) % 7;
  }
  return null;
}

// <days> <open>-<close>, e.g. "Mon-Fri 8am-5pm".
const SEGMENT = /^(.+?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i;

/**
 * Parse free-text hours into schema.org specs, or return [] if ANY part of the
 * string isn't understood.
 *
 * Deliberately does not attempt "Open 24 hours", "By appointment", "Closed
 * Sundays" or anything else that isn't a plain day-range plus a time-range.
 * Those are all real things owners type, and all of them mean this returns
 * nothing — which is the correct outcome, not a gap to fill in later with
 * guesses.
 */
export function parseOpeningHours(input: string | null | undefined): OpeningHoursSpec[] {
  const raw = (input ?? '').trim();
  if (!raw) return [];

  const segments = raw.split(/\s*[,;]\s*/).map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) return [];

  const specs: OpeningHoursSpec[] = [];
  for (const segment of segments) {
    const match = segment.match(SEGMENT);
    if (!match) return [];
    const days = toDays(match[1]);
    const opens = toTime(match[2]);
    const closes = toTime(match[3]);
    if (!days || !opens || !closes) return [];
    // A close at or before the open means the string was ambiguous — most often
    // "8-4" with no am/pm, which reads as 08:00 to 04:00. Rather than guess that
    // they meant 16:00, drop the lot.
    if (closes <= opens) return [];
    specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes });
  }

  // A day appearing in two segments would be contradictory rather than
  // additional (this format has no way to express a split shift), so treat it
  // as unparseable too.
  const seen = new Set<string>();
  for (const spec of specs) {
    for (const day of spec.dayOfWeek) {
      if (seen.has(day)) return [];
      seen.add(day);
    }
  }

  return specs;
}
