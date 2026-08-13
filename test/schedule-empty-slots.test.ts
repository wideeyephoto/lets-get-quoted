import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTimeAxis, capLanes, packOverlaps, type TimelineEntry } from '@/lib/schedule-timeline';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'globals.css'));
const TIMELINE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleTimeline.tsx'));
const PROVIDER = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleDragProvider.tsx'));

/**
 * Booking into an empty hour, from the hour.
 *
 * Every route to a booked job on this page started from the JOB — arm it or
 * pick it up, then go and find a date. That is the right order when you are
 * working a backlog and the wrong one when you are looking at Tuesday morning
 * and can see the hole. The empty hours are targets now, and the two directions
 * meet at the same drop prompt.
 */

/* ===========================================================================
   1. Which hours are offered
   ======================================================================== */

/**
 * The free-hour rule, reproduced from the component so the arithmetic is
 * checkable. The component computes it inline over its own columns; this is the
 * same predicate against the same helpers, which is what makes the assertions
 * below about behavior rather than about a regex.
 */
function freeHoursFor(entries: TimelineEntry[], maxLanes = 2): number[] {
  const axis = buildTimeAxis({ entries, workdayStart: '08:00', workdayEnd: '17:00', minEndMinutes: 20 * 60 });
  const { entries: laid, overflows } = capLanes(packOverlaps(entries), maxLanes);
  const busy = [
    ...laid.map((entry) => [entry.startMinutes, entry.endMinutes] as const),
    ...overflows.map((overflow) => [overflow.startMinutes, overflow.endMinutes] as const),
  ];
  return axis.hours.slice(0, -1).filter((hour) => !busy.some(([start, end]) => start < hour + 60 && end > hour));
}

const at = (key: string, startMinutes: number, durationMinutes: number): TimelineEntry => ({ key, startMinutes, durationMinutes });

describe('the hours a column offers', () => {
  it('offers every hour of an empty day', () => {
    const free = freeHoursFor([]);
    expect(free.length).toBeGreaterThan(8);
    expect(free).toContain(9 * 60);
    expect(free).toContain(19 * 60);
  });

  /**
   * AN HOUR IS FREE ONLY IF NOTHING OVERLAPS IT AT ALL — not "mostly free", not
   * "free in the second half". A calendar that offers 10:00 while a job runs
   * 10:30 to 11:30 is a calendar proposing a double-booking.
   */
  it('withholds an hour a job merely clips', () => {
    // 10:30–11:30 touches both the 10 and the 11 band.
    const free = freeHoursFor([at('a', 10 * 60 + 30, 60)]);
    expect(free).not.toContain(10 * 60);
    expect(free).not.toContain(11 * 60);
    expect(free).toContain(9 * 60);
    expect(free).toContain(12 * 60);
  });

  it('withholds every hour a long job runs through', () => {
    const free = freeHoursFor([at('a', 9 * 60, 240)]);
    for (const hour of [9, 10, 11, 12]) expect(free, `${hour}:00`).not.toContain(hour * 60);
    expect(free).toContain(13 * 60);
  });

  /**
   * THE FOLDED-AWAY OVERLAPS COUNT TOO. capLanes hides everything past the lane
   * cap behind a "+2" marker; those jobs are still on the day. Reading free
   * hours off the drawn blocks alone would offer a slot on top of work the grid
   * had already decided it had no room to draw.
   */
  it('counts jobs hidden behind an overflow marker as busy', () => {
    const crowd = [at('a', 14 * 60, 60), at('b', 14 * 60, 60), at('c', 14 * 60, 60), at('d', 14 * 60, 60)];
    const { overflows } = capLanes(packOverlaps(crowd), 2);
    expect(overflows.length, 'this fixture is meant to overflow').toBeGreaterThan(0);
    expect(freeHoursFor(crowd, 2)).not.toContain(14 * 60);
  });

  it('offers the hour back once the day is cleared', () => {
    expect(freeHoursFor([at('a', 15 * 60, 60)])).not.toContain(15 * 60);
    expect(freeHoursFor([])).toContain(15 * 60);
  });
});

/* ===========================================================================
   2. How they are built
   ======================================================================== */
describe('the slot targets', () => {
  /**
   * REAL BUTTONS, not pointer arithmetic on the column. Arithmetic cannot be
   * reached by a keyboard, has no accessible name, and has no way to know it is
   * over a job.
   */
  it('are buttons with a name that says the hour and the day', () => {
    expect(TIMELINE).toContain('className="sched-tl-slot"');
    expect(TIMELINE).toContain('aria-label={armedJob ? `Schedule ${armedJob.jobName} at ${when}` : `Book a job at ${when}`}');
    expect(TIMELINE).toContain("weekday: 'long'");
  });

  /**
   * ONE TAB STOP PER COLUMN. Ten hours across seven days is seventy focus stops
   * between the calendar and whatever follows it, which makes the grid
   * something to escape rather than something to use.
   */
  it('take one tab stop per column and rove with the arrow keys', () => {
    expect(TIMELINE).toContain('tabIndex={index === 0 ? 0 : -1}');
    expect(TIMELINE).toContain("event.key !== 'ArrowDown' && event.key !== 'ArrowUp'");
    expect(TIMELINE).toContain("slots[at + (event.key === 'ArrowDown' ? 1 : -1)]?.focus()");
  });

  /**
   * The column is itself a drop target while a job is armed, and its handler
   * carries no time. Without stopPropagation the bubble re-places the job at
   * the whole day and undoes the hour the click just chose.
   */
  it('do not let the column swallow the hour they carry', () => {
    const slot = TIMELINE.slice(TIMELINE.indexOf('className="sched-tl-slot"'));
    const handler = slot.slice(slot.indexOf('onClick'), slot.indexOf('onKeyDown'));
    expect(handler).toContain('event.stopPropagation()');
    expect(handler).toContain('placeArmed(column.dateKey, time)');
    expect(handler).toContain('aimSlot({ dateKey: column.dateKey, time, label: when })');
  });

  /* A demo that offers to book work and then cannot is worse than one that
     offers nothing — and a blocked day is closed, so nothing goes in it. */
  it('are not offered read-only, or on a day that is blocked off', () => {
    expect(TIMELINE).toContain('{!readOnly && !blocked');
  });

  /* A grid with a dotted + in every empty hour is a grid made of +. */
  it('are invisible until wanted, and permanent while a job is armed', () => {
    const at = CSS.indexOf('\n.sched-tl-slot {');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('opacity: 0');
    expect(CSS).toContain('.sched-tl-slot:hover,\n.sched-tl-slot:focus-visible');
    expect(CSS).toContain('.sched-tl-col.armable .sched-tl-slot {');
    // Hover does not exist on a touchscreen, where the first tap would be the
    // one that books something.
    expect(CSS).toContain('@media (hover: none) {\n  .sched-tl-slot { opacity: 0.5;');
  });
});

/* ===========================================================================
   3. The slot-first booking
   ======================================================================== */
describe('pointing at an hour and then picking a job', () => {
  it('opens the queue as part of the gesture', () => {
    const aim = PROVIDER.slice(PROVIDER.indexOf('const aimSlot'));
    expect(aim.slice(0, aim.indexOf('}, []);'))).toContain('OPEN_SCHEDULE_QUEUE_EVENT');
  });

  /**
   * ONE DROP PROMPT FOR BOTH DIRECTIONS. They are the same booking with its two
   * halves chosen in a different order; a second copy of the prompt is how the
   * two would come to disagree about undo.
   */
  it('finishes through the same prompt, with the hour already filled in', () => {
    const arm = PROVIDER.slice(PROVIDER.indexOf('const armJob = useCallback'));
    const body = arm.slice(0, arm.indexOf('}, [aimedSlot]);'));
    expect(body).toContain('setDropTime(aimedSlot.time)');
    expect(body).toContain('dateKey: aimedSlot.dateKey');
    expect(body).toContain('setAimedSlot(null)');
  });

  it('says the hour back rather than the job', () => {
    expect(PROVIDER).toContain('<strong>{aimedSlot.label}</strong> — pick a job to put here');
  });

  /* Both are cleared by Escape, in one listener, because they are never both
     set — aiming a slot clears any armed job and vice versa. */
  it('is cancelled by Escape, like everything else on this page', () => {
    expect(PROVIDER).toContain('if (!armedJob && !aimedSlot) return;');
    expect(PROVIDER).toContain('setArmedJob(null);\n      setAimedSlot(null);');
  });
});

/* ===========================================================================
   4. Aiming an armed job at an hour
   ======================================================================== */
describe('placing an armed job on an hour rather than a day', () => {
  /**
   * SAME DAY IS NOT ALWAYS A NO-OP ANY MORE. It was, because a whole-day cell
   * carries no time and dropping a job back on its own date changes nothing. An
   * HOUR does carry one — so aiming an already-scheduled job at 2pm on the day
   * it is already on is a move, and swallowing it would make the one gesture
   * that says "same day, different time" the one gesture that does nothing.
   */
  it('lets an hour move a job within its own day', () => {
    const place = PROVIDER.slice(PROVIDER.indexOf('const placeArmed = useCallback'));
    const body = place.slice(0, place.indexOf('}, [armedJob]);'));
    expect(body).toContain('const movingDay = dateKey !== armedJob.sourceDateKey;');
    expect(body).toContain("const movingTime = Boolean(time) && time !== armedJob.time;");
    expect(body).toContain('if (movingDay || movingTime)');
  });

  it('prefers the hour that was aimed at over the time the job already had', () => {
    expect(PROVIDER).toContain("setDropTime(time || armedJob.time || '');");
  });

  /* Whole-day cells still call it with one argument, so the capacity grid and
     the crew lanes are unchanged. */
  it('keeps the time optional, so day-level targets are untouched', () => {
    expect(PROVIDER).toContain('placeArmed: (dateKey: string, time?: string) => void;');
    expect(PROVIDER).toContain('const placeArmed = useCallback((dateKey: string, time?: string) => {');
  });
});

/* ===========================================================================
   5. What a block says now
   ======================================================================== */
describe('the job block', () => {
  /* The block's height was the only place a duration was stated, and a height
     is a comparison rather than a number: you can see one job is longer than
     another and not that it is three hours. */
  it('prints the length on a block tall enough to hold it, and always in the title', () => {
    expect(TIMELINE).toContain("{size === 'md' && job.hours_label ? (");
    expect(TIMELINE).toContain('className="sched-tl-job-hours"');
    const title = TIMELINE.slice(TIMELINE.indexOf('title={['), TIMELINE.indexOf("].filter(Boolean).join(' · ')", TIMELINE.indexOf('title={[')));
    expect(title).toContain('job.hours_label');
    expect(title).toContain('job.scope_label');
  });

  /**
   * THE HONEST TRAVEL WARNING. There is no distance here and computing one
   * would be a routing call per job on a page that just gave one up — but "the
   * 9am is in Fenton and the 11am is in Riverside" is a real fact about a real
   * drive, and it is the one a dispatcher reads a day for.
   */
  it('marks a job in a different town from the one before it', () => {
    expect(TIMELINE).toContain('className="sched-tl-job-travel"');
    expect(TIMELINE).toContain('travelFrom ? `Different town from the job before it, in ${travelFrom}` : null');
  });

  /* Read off the previous TIMED job in START order, not the previous lane: two
     blocks side by side at the same hour are not a journey. And silent when
     either city is missing, because "unknown to Riverside" warns of nothing. */
  it('reads the previous job in start order, and says nothing without both towns', () => {
    const build = TIMELINE.slice(TIMELINE.indexOf('const inOrder ='), TIMELINE.indexOf('return placed.map'));
    expect(build).toContain('.sort((a, b) => a.entry.startMinutes - b.entry.startMinutes)');
    expect(build).toContain('previous && city && previous.city && previous.city !== city');
    // Overlapping jobs are not a drive between them.
    expect(build).toContain('block.entry.startMinutes >= previous.endMinutes');
  });
});
