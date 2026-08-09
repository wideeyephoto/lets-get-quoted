/**
 * HOW SOON, IN WORDS — read off the setting, never asserted.
 *
 * Quick Stops was described as "same-day" on nine surfaces: the master switch,
 * the page header, the explainer, the configurator's own field hints, the
 * marketing page, the demo, the nav panel and the pitch. Meanwhile the setting
 * that decides it — `quickStopDaysAhead` — offers today only, today or
 * tomorrow, 2 days, 3 days, and up to a week.
 *
 * So an owner could set "up to a week out" and read, on the same screen, that
 * the feature takes same-day requests. Both statements came from the product;
 * only one of them was true of their account.
 *
 * THE CONTRACT IS EXPEDITED, NOT SAME-DAY. What Quick Stops actually sells is a
 * paid PRIORITY visit — sooner than the normal schedule, inside a window the
 * owner chooses. "Same-day" is one setting of that, not the name of it. Every
 * place that states a window now derives it from here, and every place that
 * names the thing says "priority visit".
 *
 * Pure, no IO, so the booking page, the dashboard, the marketing copy and the
 * customer pitch cannot drift apart again.
 */

/**
 * "today" · "today or tomorrow" · "within 2 days" · "within a week"
 *
 * Written to sit after a verb — "fit you in ___", "we can add you ___" — which
 * is every place it is used. `daysAhead` is days BEYOND today, matching
 * QUICK_STOP_DAYS_AHEAD_MAX in lib/quick-stop.
 */
export function quickStopWindowPhrase(daysAhead: number): string {
  const days = Number.isFinite(daysAhead) ? Math.max(0, Math.floor(daysAhead)) : 0;
  if (days <= 0) return 'today';
  if (days === 1) return 'today or tomorrow';
  // 4, 5 and 6 round up rather than down: "within 5 days" is a promise about a
  // week, said in a way that sounds more precise than the owner's own setting
  // (the picker offers 0, 1, 2, 3 and 7 — nothing between).
  if (days <= 3) return `within ${days} days`;
  return 'within a week';
}

/**
 * The same fact for a subject line or a headline, where a precise window reads
 * worse than the reason for it. "Need something fixed within 3 days?" is a
 * question nobody asks themselves; "sooner" is what they are actually thinking.
 */
export function quickStopWindowShort(daysAhead: number): string {
  const days = Number.isFinite(daysAhead) ? Math.max(0, Math.floor(daysAhead)) : 0;
  return days <= 1 ? quickStopWindowPhrase(days) : 'sooner';
}

/**
 * The window the customer is actually being OFFERED, from the open days the
 * booking page computed — not from the setting.
 *
 * These two differ, and the difference is the whole reason this exists. A
 * Friday-evening visitor to a Mon–Fri contractor with "up to 3 days out" set
 * has today already past its last arrival time and the weekend closed, so the
 * only day on offer is Monday. The page said "today or in the next day or two"
 * there — a promise it had itself ruled out one function call earlier.
 *
 * Takes the day options the page already built, ascending, as
 * quickStopDayOptions returns them.
 */
export function quickStopOfferedPhrase(
  days: ReadonlyArray<{ dateKey: string; label: string; isToday: boolean }>,
): string {
  if (days.length === 0) return 'soon';
  const first = days[0];
  const last = days[days.length - 1];

  if (days.length === 1) {
    if (first.isToday) return 'today';
    // "on Tomorrow" is not a sentence; the rest of the labels are dates and read
    // correctly after "on" — "on Wed, Aug 6".
    return /^tomorrow$/i.test(first.label) ? 'tomorrow' : `on ${first.label}`;
  }
  if (first.isToday) return quickStopWindowPhrase(dayGap(first.dateKey, last.dateKey));
  return 'in the next few days';
}

/** Whole days between two ISO dates, or 0 if either is unreadable. */
function dayGap(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}
