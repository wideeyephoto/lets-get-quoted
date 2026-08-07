// Quote follow-ups, reduced to the parts that are just facts: when they land,
// and what they say.
//
// Pure and dependency-free, so the Automations card can state the cadence
// instead of describing it from memory. It used to read "up to twice (around
// day 2 and day 5)" in hand-written prose sitting next to constants that could
// change without it — and "around" was there because whoever wrote the sentence
// had to work the days out by hand. The sweep in lib/followups imports these,
// so the card and the cron can't disagree.

/** Days after the quote is shared before the first nudge. */
export const FOLLOWUP_FIRST_DELAY_DAYS = 2;
/** Gap between nudges after the first. */
export const FOLLOWUP_INTERVAL_DAYS = 3;
/** Nobody gets chased more than this. */
export const MAX_FOLLOWUPS = 2;
/** An unapproved quote older than this is dead; stop chasing it. */
export const FOLLOWUP_MAX_AGE_DAYS = 21;

/**
 * Which day each nudge lands on, counted from the day the quote went out.
 * [2, 5] as configured. Derived rather than written down twice.
 */
export function followupSchedule(): number[] {
  return Array.from({ length: MAX_FOLLOWUPS }, (_, index) => FOLLOWUP_FIRST_DELAY_DAYS + index * FOLLOWUP_INTERVAL_DAYS);
}

/** "day 2 and day 5" — the schedule as the card says it out loud. */
export function followupScheduleLabel(): string {
  const days = followupSchedule().map((day) => `day ${day}`);
  if (days.length === 1) return days[0];
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

/**
 * The nudge itself.
 *
 * Shared with the settings preview, like missedCallTextBack and
 * reviewRequestText, so the contractor is never shown a message that differs
 * from the one their client receives.
 *
 * Opens with the customer's name and names the contractor in the first line.
 * It used to open "Let's Get Quoted:" — our name, on a text about somebody
 * else's quote.
 */
export function quoteFollowupText(input: { businessName: string; clientName: string; url: string }): string {
  const business = input.businessName.trim() || 'your contractor';
  const who = input.clientName.trim() || 'there';
  return `Hi ${who}, just checking in on your quote from ${business}. Ready to move forward? Review and approve it here: ${input.url}. Reply STOP to opt out.`;
}
