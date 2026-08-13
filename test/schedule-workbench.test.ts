import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleReady, suggestSlots } from '@/lib/schedule-suggestions';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
const BENCH = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleWorkbench.tsx'));
const PANEL = stripJs(read('src', 'app', 'dashboard', 'schedule', 'SchedulePanel.tsx'));
const CSS = read('src', 'app', 'globals.css');

/** A weekday map that says "works Mon–Fri" (0=Sun … 6=Sat). */
const MON_FRI = [1, 2, 3, 4, 5];
const base = {
  todayKey: '2026-08-12', // a Wednesday
  jobHours: 4,
  jobAt: null,
  hoursByDate: {},
  jobsByDate: {},
  placesByDate: {},
  capacityHours: 8,
  blockedDays: {},
  workingWeekdays: MON_FRI,
  workdayStart: '08:00',
};

/* ===========================================================================
   THE FORM ASKED A QUESTION THE PAGE ALREADY KNEW THE ANSWER TO
   ---------------------------------------------------------------------------
   Scheduling meant opening an empty date box beside a calendar that knew
   exactly which days were full, which were blocked, which are not worked at all
   and how many hours were left on each. Four presets sat under it — "Today
   8 AM", "Next Mon 8 AM" — the same guess every time, blind to all of it.
   ======================================================================== */
describe('the days it proposes are days with room', () => {
  it('starts tomorrow, not today', () => {
    // Offering this afternoon means telling a customer today, which is a
    // different kind of decision. The manual picker still allows it.
    const slots = suggestSlots(base);
    expect(slots[0].dateKey).toBe('2026-08-13');
  });

  it('skips days nobody works', () => {
    const slots = suggestSlots({ ...base, todayKey: '2026-08-14' }); // Friday
    // Saturday and Sunday are not in MON_FRI, so Monday is next.
    expect(slots[0].dateKey).toBe('2026-08-17');
  });

  it('skips days deliberately blocked', () => {
    const slots = suggestSlots({ ...base, blockedDays: { '2026-08-13': 'Off' } });
    expect(slots.map((s) => s.dateKey)).not.toContain('2026-08-13');
  });

  it('skips days without room for the job', () => {
    const slots = suggestSlots({ ...base, jobHours: 6, hoursByDate: { '2026-08-13': 5 } });
    expect(slots.map((s) => s.dateKey)).not.toContain('2026-08-13');
  });

  /**
   * A THREE-DAY JOB STILL NEEDS A FIRST DAY. Requiring
   * `capacity - booked >= jobHours` would return nothing at all for 20 hours of
   * work on an 8-hour day; the answer is "start it on the first clear day".
   */
  it('does not refuse to place a job longer than a day', () => {
    const slots = suggestSlots({ ...base, jobHours: 20 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].dateKey).toBe('2026-08-13');
  });

  /** Nobody estimated it, so the only question is whether anything is left. */
  it('asks only for some room when the job has no estimate', () => {
    expect(suggestSlots({ ...base, jobHours: null, hoursByDate: { '2026-08-13': 7.5 } })[0].dateKey).toBe('2026-08-13');
    expect(suggestSlots({ ...base, jobHours: null, hoursByDate: { '2026-08-13': 8 } })[0].dateKey).not.toBe('2026-08-13');
  });

  it('returns nothing rather than a bad day when the diary is shut', () => {
    expect(suggestSlots({ ...base, workingWeekdays: MON_FRI, lookaheadDays: 3, blockedDays: {
      '2026-08-13': 'Off', '2026-08-14': 'Off', '2026-08-15': 'Off',
    } })).toEqual([]);
  });
});

describe('and it says why', () => {
  it('names an empty day as empty and starts it at the top', () => {
    const [slot] = suggestSlots(base);
    expect(slot.reason).toBe('Nothing booked yet');
    expect(slot.time).toBe('08:00');
  });

  it('starts a part-booked day after what is already on it', () => {
    const [slot] = suggestSlots({ ...base, hoursByDate: { '2026-08-13': 2.5 }, jobsByDate: { '2026-08-13': 1 } });
    expect(slot.time).toBe('10:30');
    expect(slot.reason).toBe('5.5h free after 1 job');
  });

  /** An arrival at 11:06 is a time nobody says out loud. */
  it('rounds a start time up to the half hour', () => {
    const [slot] = suggestSlots({ ...base, hoursByDate: { '2026-08-13': 3.1 }, jobsByDate: { '2026-08-13': 2 } });
    expect(slot.time).toBe('11:30');
  });

  it('counts the jobs, so one job reads as one', () => {
    const [slot] = suggestSlots({ ...base, hoursByDate: { '2026-08-13': 1 }, jobsByDate: { '2026-08-13': 3 } });
    expect(slot.reason).toBe('7h free after 3 jobs');
  });

  /** Straight-line, and the UI says so: a mile of river is not a mile of road. */
  it('measures to the nearest job already on that day', () => {
    const [slot] = suggestSlots({
      ...base,
      jobAt: { lat: 42.5, lng: -83.1 },
      jobsByDate: { '2026-08-13': 1 },
      hoursByDate: { '2026-08-13': 2 },
      placesByDate: { '2026-08-13': [{ lat: 42.6, lng: -83.1 }, { lat: 44, lng: -83.1 }] },
    });
    // ~6.9 miles to the nearer of the two, not the further.
    expect(slot.milesFromDayWork).toBeGreaterThan(6);
    expect(slot.milesFromDayWork).toBeLessThan(8);
    expect(PANEL).toContain("mi from that day's work");
  });

  /** Null is "cannot say", never "nearby". */
  it('says nothing about distance when either end has no coordinates', () => {
    expect(suggestSlots({ ...base, jobAt: null })[0].milesFromDayWork).toBeNull();
    expect(suggestSlots({ ...base, jobAt: { lat: 42, lng: -83 } })[0].milesFromDayWork).toBeNull();
  });

  it('survives a workday start that is nonsense rather than proposing midnight', () => {
    expect(suggestSlots({ ...base, workdayStart: null })[0].time).toBe('08:00');
    expect(suggestSlots({ ...base, workdayStart: 'half eight' })[0].time).toBe('08:00');
  });
});

/**
 * "Save Start Date" was always enabled, and pressing it with an empty date
 * redirected back to the queue having done nothing — indistinguishable from a
 * broken button.
 */
describe('the button is named for what it does, and off until it can do it', () => {
  it('needs a real date', () => {
    expect(scheduleReady({ dateKey: null, time: null })).toBe(false);
    expect(scheduleReady({ dateKey: '', time: '08:00' })).toBe(false);
    expect(scheduleReady({ dateKey: 'soon', time: '08:00' })).toBe(false);
    expect(scheduleReady({ dateKey: '2026-08-13', time: null })).toBe(true);
  });

  /** A time is genuinely optional — "that Thursday, time to be confirmed" is a
   *  real thing to book, and the job carries a null scheduled_time for it. */
  it('does not demand a time', () => {
    expect(scheduleReady({ dateKey: '2026-08-13', time: '' })).toBe(true);
  });

  it('is wired to the button', () => {
    expect(PANEL).toContain("const ready = scheduleReady({ dateKey, time: time || null });");
    expect(PANEL).toContain('disabled={!ready}');
    expect(PANEL).not.toContain('Save Start Date');
  });

  /**
   * And the button says which of the two things it is about to do.
   *
   * "Schedule job" on a quote nobody has accepted is the same contradiction the
   * queue card had: the page offering to book work that has not been sold, in
   * the same words it uses for work that has.
   */
  it('names the commit differently when the quote is not approved', () => {
    expect(PANEL).toContain("{job.approved ? 'Schedule job' : 'Tentatively schedule'}");
    expect(PANEL).toContain("savedLabel={job.approved ? 'Scheduled' : 'Penciled in'}");
  });
});

/* ===========================================================================
   THE LAYOUT
   ======================================================================== */
describe('queue, calendar, open job — three columns', () => {
  it('passes the calendar through as children rather than re-rendering it', () => {
    expect(PAGE).toContain('<ScheduleWorkbench');
    expect(BENCH).toContain('children: ReactNode;');
    expect(BENCH).toContain('{children}');
  });

  /**
   * THE GRID IS DEFINED ONCE. There were two `.schedule-workbench` blocks ten
   * thousand lines apart, and the later one won — measured at 1680 the calendar
   * came out 420px wide beside a 905px queue, with the new rules having no
   * effect at all.
   */
  it('defines the grid in exactly one place', () => {
    const declarations = CSS.match(/^\.schedule-workbench \{/gm) ?? [];
    expect(declarations.length).toBe(1);
  });

  /**
   * 1760, AND THE MEASUREMENT IS WHY — the two earlier numbers were estimates
   * and both were wrong in the same direction.
   *
   * This grid measures viewport minus 338px (the docked nav plus the page
   * gutters) at 1440, 1600 and 1920 alike. The rails then take their GROWTH
   * LIMITS, not their minimums — an fr track only sees free space after a
   * minmax() track has filled to its max — so the pair costs 340 + 380 + 36 of
   * gap, not the 620 the 1600 guess assumed. At 1600 that left the calendar
   * 506px: 68px per weekday, worse than the ~82px this pass exists to fix.
   * 1760 leaves 666px, which is 95px per weekday.
   */
  it('adds the third column only where it is affordable', () => {
    expect(CSS).toContain('@media (min-width: 1760px) {\n  .schedule-workbench { grid-template-columns: minmax(300px, 340px) minmax(0, 1fr) minmax(320px, 380px); }');
    // The component's own breakpoint has to agree, or the panel announces
    // itself as a modal dialog while sitting in a docked column.
    expect(BENCH).toContain("window.matchMedia('(min-width: 1760px)')");
  });

  /** 1280 is UnscheduledQueue's own breakpoint: below it the queue is a
   *  full-screen overlay, so a column reserved for it is an empty gap. */
  it('starts the queue column where the queue stops being an overlay', () => {
    expect(CSS).toContain('@media (min-width: 1280px) {\n  .schedule-workbench {\n    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);');
    expect(read('src', 'app', 'dashboard', 'schedule', 'UnscheduledQueue.tsx')).toContain("'(max-width: 1279.98px)'");
  });

  it('is a region when docked and a dialog when it is not', () => {
    expect(PANEL).toContain("role={docked ? 'region' : 'dialog'}");
    expect(PANEL).toContain('aria-modal={docked ? undefined : true}');
    expect(PANEL).toContain('useModal(Boolean(job) && !docked, panelRef, onClose,');
  });
});

/* Nine jobs waiting meant eighteen buttons, and every card carried its own
   inline form: opening one pushed it to ~480px and shoved the list off screen. */
describe('one row per job, one action on it', () => {
  it('drops the two-equal-buttons card', () => {
    expect(PAGE).not.toContain('schedule-choose-when');
    expect(PAGE).not.toContain('Offer customer times');
    expect(PAGE).not.toContain('schedule-action-buttons');
    expect(BENCH).toContain('className="btn primary sched-row-go"');
  });

  /** Which of you picks the time is a step inside scheduling, not a fork
   *  before it — so it is asked once, of the job you actually chose. */
  it('moves the fork into the panel', () => {
    expect(PANEL).toContain("const [mode, setMode] = useState<Mode>('pick');");
    expect(PANEL).toContain('Let the customer pick');
    expect(PANEL).toContain('sendClientScheduleOptionsAction.bind(null, job.id)');
  });

  it('shows what a scheduling decision needs', () => {
    for (const fact of ['job.cityLabel', 'Duration not set', 'No crew yet', 'Quote not approved']) {
      expect(BENCH, fact).toContain(fact);
    }
  });

  /**
   * And what the job is SHORT of, as chips rather than as dimmer text.
   *
   * The three facts above used to carry this by going grey when a value was
   * missing, which reads as unimportant — the opposite of true for a job with
   * no duration on a calendar whose whole job is measuring how full a day is.
   */
  it('names the outstanding work from the shared helper, not its own list', () => {
    expect(BENCH).toContain("jobBlockers(job).filter((blocker) => blocker.key !== 'approval')");
    expect(BENCH).toContain('className="sched-row-blocker"');
    // The panel reads the same helper, so the card and the panel cannot
    // disagree about what a job still needs.
    expect(PANEL).toContain('jobBlockers({ ...job, crewIds })');
  });

  /** The card's big obvious target used to be a link to the job page — away
   *  from the page you were scheduling on. */
  it('makes the row itself the control', () => {
    expect(BENCH).toContain('className="sched-row-open"');
    expect(BENCH).toContain('aria-pressed={on}');
  });

  /** A new job is a new decision: without this, opening the second job in the
   *  queue arrives with the first one's date filled in and a live button. */
  it('resets the draft when the job changes', () => {
    expect(PANEL).toContain('}, [job?.id, job?.crewIds]);');
    expect(PANEL).toContain('setDateKey(null);');
  });

  /** Scheduling revalidates the page and unmounts the panel; a crew write
   *  fired after that would be racing its own teardown. */
  it('writes crew before it writes the date', () => {
    const body = PANEL.slice(PANEL.indexOf('action={async (formData: FormData) => {'));
    expect(body.indexOf('updateJobCrewAction')).toBeLessThan(body.indexOf('scheduleJobAction'));
  });
});

/** The presets knew nothing about which days were full. */
describe('the old presets are gone', () => {
  it('leaves no quick-schedule grid behind', () => {
    expect(PAGE).not.toContain('quickSchedulePresets');
    expect(PAGE).not.toContain('schedule-preset-button');
  });
});

/**
 * MEASURED IN THE BROWSER: the availability strip was built for a full-width
 * card. Docked at 1920 it drew four day-cards side by side at ~90px each with
 * their city pills and "+ Add" buttons clipped.
 */
describe('the customer-picks strip fits the panel it is in', () => {
  it('goes to one column inside the detail rail', () => {
    expect(CSS).toContain('.sched-detail .client-schedule-calendar-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(CSS).toContain('.sched-detail .client-schedule-selected-list { grid-template-columns: minmax(0, 1fr); }');
  });
});

/**
 * Pressing a suggested slot has to be able to SET the time picker, not just
 * read it. Uncontrolled, it went on showing "No set time" beside a chosen
 * 8:00 AM.
 */
describe('the time picker can be told as well as asked', () => {
  it('takes a controlled value, like its date sibling', () => {
    const picker = read('src', 'components', 'time-slot-select.tsx');
    expect(picker).toContain('const controlled = value !== undefined;');
    expect(picker).toContain('const selectedTime = controlled ? value : innerTime;');
    expect(picker).toContain('if (!controlled) setInnerTime(next);');
    expect(picker).toContain('onChange?.(next);');
  });
});

/**
 * ASSIGNING SOMEBODY TEXTS THEM.
 *
 * The queue's old crew picker had two submits — "Save & text" and "Save without
 * texting". The first draft of this panel dropped both and passed a hardcoded
 * `true`. Caught scheduling a job end to end in the browser: the send fired,
 * and the only reason nobody was messaged is that seeded crew carry 555
 * numbers, which Twilio refuses ("The 'To' number 555**** is not a valid phone
 * number"). On a real roster it would have texted somebody because a button
 * said "Schedule job".
 */
describe('texting the crew is a choice, not a side effect', () => {
  it('reads a switch rather than a constant', () => {
    expect(PANEL).toContain('await updateJobCrewAction(job.id, notifyCrew, crewForm);');
    expect(PANEL).not.toContain('updateJobCrewAction(job.id, true, crewForm)');
  });

  it('offers it only when somebody would be texted', () => {
    expect(PANEL).toContain('{crewIds.length > 0 ? (\n                <label className="sched-notify">');
  });

  /** On by default, matching which of the two old submits was the primary. */
  it('defaults on, and resets with the job', () => {
    expect(PANEL).toContain('const [notifyCrew, setNotifyCrew] = useState(true);');
    expect(PANEL).toContain('setNotifyCrew(true);');
  });

  /** The confirmation has to say which way it is going. */
  it('says so in the confirmation line', () => {
    expect(PANEL).toContain("${notifyCrew ? 'Newly added crew get a text.' : 'Nobody gets a text.'}");
  });
});
