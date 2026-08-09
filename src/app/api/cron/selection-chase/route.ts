import { cronRoute } from '@/lib/cron-runs';
import { runChoiceReminderSweep } from '@/lib/choice-reminder-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Hourly sweep (scheduled in vercel.json) that reminds homeowners sitting on a
// decision: on the needed-by date, and again two days later if the choices are
// still outstanding. Never for a choice with no date on it — a contractor who
// left the date blank said this one does not matter yet.
//
// HOURLY, NOT DAILY, and that is the whole reason the schedule changed. It used
// to run once at 17:00 UTC, which is 1pm in New York and 7am in Honolulu: the
// send time was a side effect of a cron expression and appeared nowhere in the
// interface. Each account now acts only when its OWN clock reaches the hour it
// chose, which means this has to be offered every hour for any of them to be
// able to pick one.
//
// The route keeps its path. Renaming it would break the vercel.json entry, the
// cron_runs history and the health page's reading of both, for no gain.
//
// Batched per job, so a kitchen with six choices due the same day is one text.
export const GET = cronRoute('selection-chase', runChoiceReminderSweep);
