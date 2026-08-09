import { describe, it, expect } from 'vitest';
import {
  CHOICE_ELIGIBILITY_LABEL,
  CHOICE_OFFSET_CHOICES,
  CHOICE_OPT_OUT_LINE,
  CHOICE_REMINDER_GRACE_DAYS,
  CHOICE_REMINDER_HOUR_CHOICES,
  CHOICE_STOP_LABEL,
  CHOICE_TEMPLATE_MAX,
  CHOICE_TEMPLATE_TOKENS,
  DEFAULT_CHOICE_REMINDER_HOUR,
  DEFAULT_CHOICE_REMINDER_OFFSETS,
  DEFAULT_CHOICE_REMINDER_TEMPLATE,
  MAX_CHOICE_REMINDERS,
  choiceCountLabel,
  choiceDayDiff,
  choiceDueLabel,
  choiceGroupingLabel,
  choiceListText,
  choiceReminderDueOn,
  choiceReminderPreview,
  choiceReminderSettingsFromAccount,
  choiceReminderText,
  choiceScheduleLabel,
  dueChoiceStage,
  isChoiceEligible,
  isChoiceReminderHourNow,
  isJobRemindable,
  normalizeChoiceGrouping,
  normalizeChoiceOffsets,
  normalizeChoiceReminderHour,
  planChoiceReminders,
  shouldStopChoiceReminders,
  validateChoiceTemplate,
  type ChoiceForReminder,
  type PlannableChoice,
} from '@/lib/choice-reminders';
import { zonedNowParts } from '@/lib/quick-stop';

// These decide whether a real text lands on a homeowner's phone, and when.
//
// The behaviour they replace is worth stating, because several of the old tests
// asserted the bug: the first reminder fired the moment a choice came within
// DECISION_CHASE_DAYS — seven days — of its date, which meant the needed-by date
// itself passed in silence, and the "second" reminder went the very next day
// rather than two days later.

// -- Settings ----------------------------------------------------------------

describe('normalizeChoiceOffsets', () => {
  it('keeps a real schedule', () => {
    expect(normalizeChoiceOffsets([0, 2])).toEqual([0, 2]);
    expect(normalizeChoiceOffsets(['0', '3', '7'])).toEqual([0, 3, 7]);
  });

  it('reads a Postgres array literal, in case the client hands one back unparsed', () => {
    expect(normalizeChoiceOffsets('{0,2}')).toEqual([0, 2]);
  });

  it('sorts and de-duplicates rather than rejecting', () => {
    // Two reminders on the same day is one reminder, and an out-of-order array
    // is a schedule somebody meant in order.
    expect(normalizeChoiceOffsets([2, 0, 2])).toEqual([0, 2]);
  });

  it('never schedules more than the maximum', () => {
    expect(normalizeChoiceOffsets([0, 1, 2, 3, 4, 5])).toHaveLength(MAX_CHOICE_REMINDERS);
  });

  it('falls back to the default for absent, empty and nonsense', () => {
    // An enabled automation with no schedule is one that looks on and does
    // nothing, which is worse than one that is off.
    expect(normalizeChoiceOffsets(undefined)).toEqual([...DEFAULT_CHOICE_REMINDER_OFFSETS]);
    expect(normalizeChoiceOffsets([])).toEqual([...DEFAULT_CHOICE_REMINDER_OFFSETS]);
    expect(normalizeChoiceOffsets(['soon'])).toEqual([...DEFAULT_CHOICE_REMINDER_OFFSETS]);
  });

  it('clamps an offset nobody could have meant', () => {
    expect(normalizeChoiceOffsets([-5])).toEqual([0]);
    expect(normalizeChoiceOffsets([9000])).toEqual([30]);
  });
});

describe('normalizeChoiceReminderHour', () => {
  it('treats an absent column as the default, not as midnight', () => {
    // Number(null) and Number('') are both 0, and 0 is a real hour. Reading a
    // missing column as "send at midnight" is a plausible-looking wrong answer.
    expect(normalizeChoiceReminderHour(null)).toBe(DEFAULT_CHOICE_REMINDER_HOUR);
    expect(normalizeChoiceReminderHour('')).toBe(DEFAULT_CHOICE_REMINDER_HOUR);
    expect(normalizeChoiceReminderHour(undefined)).toBe(DEFAULT_CHOICE_REMINDER_HOUR);
  });

  it('still accepts an explicit midnight', () => {
    expect(normalizeChoiceReminderHour(0)).toBe(0);
  });

  it('refuses an hour that is not one', () => {
    expect(normalizeChoiceReminderHour(24)).toBe(DEFAULT_CHOICE_REMINDER_HOUR);
    expect(normalizeChoiceReminderHour('morning')).toBe(DEFAULT_CHOICE_REMINDER_HOUR);
  });
});

describe('the choices offered in the panel', () => {
  it('every one survives its own normaliser', () => {
    for (const hour of CHOICE_REMINDER_HOUR_CHOICES) expect(normalizeChoiceReminderHour(String(hour))).toBe(hour);
    for (const offset of CHOICE_OFFSET_CHOICES) expect(normalizeChoiceOffsets([String(offset)])).toEqual([offset]);
  });

  it('offers the defaults, so an untouched account sees its own value', () => {
    expect(CHOICE_REMINDER_HOUR_CHOICES).toContain(DEFAULT_CHOICE_REMINDER_HOUR);
    for (const offset of DEFAULT_CHOICE_REMINDER_OFFSETS) expect(CHOICE_OFFSET_CHOICES).toContain(offset);
  });

  it('never offers an hour inside the DST switchover', () => {
    // US clocks change at 02:00. An account set to send at 2am would simply not
    // send on the spring-forward day and would sit in a repeated hour in autumn.
    for (const hour of CHOICE_REMINDER_HOUR_CHOICES) {
      expect(hour).toBeGreaterThanOrEqual(6);
      expect(hour).toBeLessThanOrEqual(20);
    }
  });
});

describe('choiceReminderSettingsFromAccount', () => {
  it('reads an account that has never touched the settings', () => {
    expect(choiceReminderSettingsFromAccount({})).toEqual({
      enabled: true,
      offsets: [...DEFAULT_CHOICE_REMINDER_OFFSETS],
      hour: DEFAULT_CHOICE_REMINDER_HOUR,
      template: null,
      grouping: 'job',
    });
  });

  it('defaults ON, including on a pre-migration row', () => {
    // A contractor who typed a needed-by date has already said they want the
    // homeowner chased. A column that has not been migrated yet must not read
    // as "they switched it off".
    expect(choiceReminderSettingsFromAccount(null).enabled).toBe(true);
    expect(choiceReminderSettingsFromAccount({ selection_reminders_enabled: false }).enabled).toBe(false);
  });

  it('treats an emptied template box as "use the default", not as a blank text', () => {
    expect(choiceReminderSettingsFromAccount({ selection_reminder_template: '   ' }).template).toBeNull();
    expect(choiceReminderSettingsFromAccount({ selection_reminder_template: 'Hi {client} {link}' }).template)
      .toBe('Hi {client} {link}');
  });

  it('refuses a grouping it does not implement', () => {
    expect(normalizeChoiceGrouping('per_choice')).toBe('per_choice');
    expect(normalizeChoiceGrouping('per_option')).toBe('job');
  });
});

// -- The schedule, said out loud ---------------------------------------------

describe('choiceScheduleLabel', () => {
  it('says the default schedule the way the panel is specified to say it', () => {
    expect(choiceScheduleLabel([0, 2])).toBe('On the needed-by date and 2 days later');
  });

  it('handles one reminder, and three', () => {
    expect(choiceScheduleLabel([0])).toBe('On the needed-by date');
    expect(choiceScheduleLabel([0, 2, 7])).toBe('On the needed-by date, 2 days later and 7 days later');
  });

  it('reads as a sentence when the first reminder is not on the date itself', () => {
    expect(choiceScheduleLabel([1, 3])).toBe('1 day after the needed-by date and 3 days later');
  });

  it('describes only a schedule the sweep would actually run', () => {
    // The label and the cron read the same array through the same normaliser,
    // which is what stops the panel promising a cadence nothing performs.
    expect(choiceScheduleLabel([2, 0, 2])).toBe(choiceScheduleLabel([0, 2]));
  });
});

// -- Dates -------------------------------------------------------------------

describe('choiceDayDiff', () => {
  it('counts calendar days, not hours', () => {
    expect(choiceDayDiff('2026-08-10', '2026-08-12')).toBe(2);
    expect(choiceDayDiff('2026-08-12', '2026-08-10')).toBe(-2);
    expect(choiceDayDiff('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('is right across a DST boundary, where a day is 23 or 25 hours', () => {
    // 2026-03-08 is spring-forward in the US. Subtracting timestamps here would
    // give 0.958 days and round the wrong way.
    expect(choiceDayDiff('2026-03-07', '2026-03-08')).toBe(1);
    expect(choiceDayDiff('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('is right across a month and a year end', () => {
    expect(choiceDayDiff('2026-08-30', '2026-09-01')).toBe(2);
    expect(choiceDayDiff('2026-12-31', '2027-01-02')).toBe(2);
  });
});

describe('choiceReminderDueOn', () => {
  it('puts stage 0 on the needed-by date itself', () => {
    expect(choiceReminderDueOn('2026-08-10', 0)).toBe('2026-08-10');
  });

  it('puts the second reminder exactly two days later', () => {
    expect(choiceReminderDueOn('2026-08-10', 2)).toBe('2026-08-12');
  });

  it('crosses month ends without help', () => {
    expect(choiceReminderDueOn('2026-08-30', 2)).toBe('2026-09-01');
    expect(choiceReminderDueOn('2026-02-27', 2)).toBe('2026-03-01');
  });
});

describe('dueChoiceStage', () => {
  const offsets = [0, 2];

  it('sends nothing before the needed-by date', () => {
    // THE HEADLINE FIX. The old rule fired the first reminder up to seven days
    // early, off a constant that exists to colour a label on the board.
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-03', offsets })).toBeNull();
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-09', offsets })).toBeNull();
  });

  it('sends the first reminder ON the needed-by date', () => {
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-10', offsets })).toBe(0);
  });

  it('sends nothing on the day between', () => {
    // Not a gap in the rule — the schedule is [0, 2], and day 1 belongs to
    // neither. The old behaviour sent on day 1, because "overdue" meant any day
    // after the date at all.
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-11', offsets })).toBe(0);
  });

  it('sends the second reminder exactly two days later', () => {
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-12', offsets })).toBe(1);
  });

  it('skips a missed day rather than replaying it', () => {
    // The cron was down, or the automation was switched on this morning. Sending
    // stage 0 today and stage 1 tomorrow is a schedule the panel never promised,
    // and the customer experiences it as a backlog being worked through at them.
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-13', offsets })).toBe(1);
  });

  it('stops looking once the tail has passed', () => {
    // Without this, switching the automation on would text every homeowner who
    // ever had a deadline. The old code had no tail bound at all: a needed-by
    // date from last March stayed "overdue, never nudged" forever.
    const last = 2 + CHOICE_REMINDER_GRACE_DAYS;
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: choiceReminderDueOn('2026-08-10', last), offsets })).toBe(1);
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: choiceReminderDueOn('2026-08-10', last + 1), offsets })).toBeNull();
    expect(dueChoiceStage({ neededBy: '2026-03-01', today: '2026-08-10', offsets })).toBeNull();
  });

  it('honours a schedule that is not the default', () => {
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-10', offsets: [1] })).toBeNull();
    expect(dueChoiceStage({ neededBy: '2026-08-10', today: '2026-08-11', offsets: [1] })).toBe(0);
  });
});

// -- The sending window ------------------------------------------------------

describe('isChoiceReminderHourNow', () => {
  it('is true from the chosen hour', () => {
    expect(isChoiceReminderHourNow('09:00', 9)).toBe(true);
    expect(isChoiceReminderHourNow('09:59', 9)).toBe(true);
  });

  it('is false before it', () => {
    expect(isChoiceReminderHourNow('08:59', 9)).toBe(false);
    expect(isChoiceReminderHourNow('00:00', 9)).toBe(false);
  });

  it('allows a late cron to catch up, but only for a while', () => {
    // An hourly sweep that is throttled or briefly failing must not mean a whole
    // day's reminders are never sent — with absolute day offsets, "never" is the
    // right word, because tomorrow the day has moved on.
    expect(isChoiceReminderHourNow('11:00', 9)).toBe(true);
    expect(isChoiceReminderHourNow('12:00', 9)).toBe(false);
  });

  it('never wraps past midnight', () => {
    // An 8pm send time gets 20:00, 21:00 and 22:00 — and then stops, rather than
    // spilling into a day whose offsets have all moved by one. The clamp is what
    // does it: a 10pm send time gets 22:00 and 23:00 and no more.
    expect(isChoiceReminderHourNow('22:00', 20)).toBe(true);
    expect(isChoiceReminderHourNow('23:00', 20)).toBe(false);
    expect(isChoiceReminderHourNow('23:00', 22)).toBe(true);
    expect(isChoiceReminderHourNow('00:00', 22)).toBe(false);
    expect(isChoiceReminderHourNow('01:00', 20)).toBe(false);
  });

  it('refuses a time it cannot read', () => {
    expect(isChoiceReminderHourNow('', 9)).toBe(false);
    expect(isChoiceReminderHourNow('half nine', 9)).toBe(false);
  });
});

describe('the window against a real clock', () => {
  // 2026-08-10T13:30:00Z is 09:30 in New York and 06:30 in Los Angeles. One
  // account is inside a 9am window and the other is not, in the same run — which
  // is the whole reason the sweep resolves the hour per account rather than
  // taking it from the cron expression.
  const now = new Date('2026-08-10T13:30:00.000Z');

  it("is that account's morning in New York", () => {
    const { dateKey, time } = zonedNowParts(now, 'America/New_York');
    expect(dateKey).toBe('2026-08-10');
    expect(isChoiceReminderHourNow(time, 9)).toBe(true);
  });

  it('and is three hours too early in Los Angeles', () => {
    const { dateKey, time } = zonedNowParts(now, 'America/Los_Angeles');
    expect(dateKey).toBe('2026-08-10');
    expect(isChoiceReminderHourNow(time, 9)).toBe(false);
  });

  it('and the two are on different calendar days just after UTC midnight', () => {
    // 2026-08-11T02:00:00Z: still the 10th in both US zones, already the 11th in
    // UTC. The old sweep keyed off toISOString() and would have been reminding
    // about tomorrow's deadlines for five hours every night.
    const late = new Date('2026-08-11T02:00:00.000Z');
    expect(zonedNowParts(late, 'America/New_York').dateKey).toBe('2026-08-10');
    expect(late.toISOString().slice(0, 10)).toBe('2026-08-11');
  });
});

// -- Eligibility and the automatic stops -------------------------------------

function choice(overrides: Partial<ChoiceForReminder> = {}): ChoiceForReminder {
  return { id: 'c1', title: 'Patio tile', status: 'open', decideBy: '2026-08-10', optionCount: 2, ...overrides };
}

describe('isChoiceEligible', () => {
  it('accepts an open, dated choice with something to choose between', () => {
    expect(isChoiceEligible(choice())).toBe(true);
  });

  it('refuses a choice with no needed-by date', () => {
    // A contractor who left the date blank said this one does not matter yet.
    expect(isChoiceEligible(choice({ decideBy: null }))).toBe(false);
  });

  it('refuses a choice already submitted, or taken off the table', () => {
    expect(isChoiceEligible(choice({ status: 'chosen' }))).toBe(false);
    expect(isChoiceEligible(choice({ status: 'cancelled' }))).toBe(false);
  });

  it('refuses a choice with nothing to choose between', () => {
    expect(isChoiceEligible(choice({ optionCount: 0 }))).toBe(false);
  });
});

describe('isJobRemindable', () => {
  it('reminds on a live job', () => {
    expect(isJobRemindable({ status: 'in_progress' })).toBe(true);
    expect(isJobRemindable({ status: 'new_lead' })).toBe(true);
  });

  it('never reminds on a finished or cancelled one', () => {
    // `archived` is how this product files a cancellation. The old sweep never
    // looked at the job at all, so a job called off last week still texted its
    // homeowner "we're waiting on 3 choices before we can order".
    expect(isJobRemindable({ status: 'complete' })).toBe(false);
    expect(isJobRemindable({ status: 'archived' })).toBe(false);
  });
});

describe('shouldStopChoiceReminders', () => {
  const live = { enabled: true, job: { status: 'in_progress' }, choices: [choice()], optedOut: false };

  it('does not stop while there is something eligible to chase', () => {
    expect(shouldStopChoiceReminders(live).stop).toBe(false);
  });

  it('stops when the automation is off', () => {
    expect(shouldStopChoiceReminders({ ...live, enabled: false })).toEqual({ stop: true, reason: 'disabled' });
  });

  it('stops when the job is closed or cancelled', () => {
    expect(shouldStopChoiceReminders({ ...live, job: { status: 'complete' } }).reason).toBe('job_closed');
    expect(shouldStopChoiceReminders({ ...live, job: { status: 'archived' } }).reason).toBe('job_closed');
  });

  it('stops when the customer has opted out', () => {
    expect(shouldStopChoiceReminders({ ...live, optedOut: true }).reason).toBe('opted_out');
  });

  it('stops when every choice has been submitted', () => {
    expect(shouldStopChoiceReminders({ ...live, choices: [choice({ status: 'chosen' })] }).reason).toBe('all_submitted');
  });

  it('tells "they picked everything" apart from "somebody cleared the dates"', () => {
    // Both are a stop, and both leave the ledger a reason. They are different
    // enough answers to be worth telling apart at 2am.
    expect(shouldStopChoiceReminders({ ...live, choices: [choice({ decideBy: null })] }).reason).toBe('no_needed_by');
  });

  it('states every stop the panel promises', () => {
    // CHOICE_STOP_LABEL is rendered as fact in the settings panel. It has to be
    // true of this function, or the panel is describing something else.
    expect(CHOICE_STOP_LABEL).toBe('When all choices are submitted or the job is closed');
    expect(CHOICE_ELIGIBILITY_LABEL).toBe('Only choices with a needed-by date');
    expect(choiceGroupingLabel('job')).toBe('One combined reminder per job');
  });
});

// -- Planning ----------------------------------------------------------------

function plannable(overrides: Partial<PlannableChoice> = {}): PlannableChoice {
  return { ...choice(), jobId: 'job-1', ...overrides };
}

describe('planChoiceReminders', () => {
  const today = '2026-08-10';

  it('combines every choice on one job into one message', () => {
    const plan = planChoiceReminders({
      today,
      choices: [
        plannable({ id: 'a', title: 'Patio tile' }),
        plannable({ id: 'b', title: 'Kitchen faucet' }),
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].titles).toEqual(['Patio tile', 'Kitchen faucet']);
    expect(plan[0].selectionIds).toEqual(['a', 'b']);
    // One ledger row, because both share a needed-by date and a stage.
    expect(plan[0].claims).toEqual([{ neededBy: '2026-08-10', stage: 0, dueOn: '2026-08-10' }]);
  });

  it('keeps different jobs apart', () => {
    const plan = planChoiceReminders({
      today,
      choices: [
        plannable({ id: 'a', jobId: 'job-1' }),
        plannable({ id: 'b', jobId: 'job-2' }),
      ],
    });
    expect(plan).toHaveLength(2);
    expect(plan.map((send) => send.jobId).sort()).toEqual(['job-1', 'job-2']);
  });

  it('leaves out everything ineligible', () => {
    const plan = planChoiceReminders({
      today,
      choices: [
        plannable({ id: 'ok' }),
        plannable({ id: 'no-date', decideBy: null }),
        plannable({ id: 'submitted', status: 'chosen' }),
        plannable({ id: 'cancelled', status: 'cancelled' }),
        plannable({ id: 'no-options', optionCount: 0 }),
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].selectionIds).toEqual(['ok']);
  });

  it('sends nothing at all when the whole board has been decided', () => {
    const plan = planChoiceReminders({
      today,
      choices: [plannable({ id: 'a', status: 'chosen' }), plannable({ id: 'b', status: 'chosen' })],
    });
    expect(plan).toEqual([]);
  });

  it('still sends one message when two needed-by dates collide on the same day', () => {
    // Tile needed the 10th, faucet the 12th: stage 1 of the 10th and stage 0 of
    // the 12th both fall on the 12th. Grouping only by date would text this
    // homeowner twice within a second, which is exactly what "one combined
    // reminder per job" exists to prevent.
    const plan = planChoiceReminders({
      today: '2026-08-12',
      choices: [
        plannable({ id: 'tile', title: 'Patio tile', decideBy: '2026-08-10' }),
        plannable({ id: 'faucet', title: 'Kitchen faucet', decideBy: '2026-08-12' }),
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].titles).toEqual(['Patio tile', 'Kitchen faucet']);
    // ONE message, but TWO ledger rows — the unit of sending is (job, day) and
    // the unit of recording stays (job, needed-by, stage), so the duplicate
    // guard is still keyed on the thing it has to be keyed on.
    expect(plan[0].claims).toEqual([
      { neededBy: '2026-08-10', stage: 1, dueOn: '2026-08-12' },
      { neededBy: '2026-08-12', stage: 0, dueOn: '2026-08-12' },
    ]);
  });

  it('and one message when a LATE stage lands on the same day as an on-time one', () => {
    // The case the dueOn key got wrong. Tile needed the 9th, so its stage 1 was
    // nominally due on the 11th — a day dueChoiceStage skips rather than
    // replays, so it goes out on the 12th alongside the faucet's stage 0.
    // Bucketing by each stage's own dueOn puts them in different buckets and
    // sends the homeowner two texts a second apart.
    const plan = planChoiceReminders({
      today: '2026-08-12',
      choices: [
        plannable({ id: 'tile', title: 'Patio tile', decideBy: '2026-08-09' }),
        plannable({ id: 'faucet', title: 'Kitchen faucet', decideBy: '2026-08-12' }),
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].titles).toEqual(['Patio tile', 'Kitchen faucet']);
    expect(plan[0].sendOn).toBe('2026-08-12');
    // Each ledger row keeps its own nominal due date, so the record still says
    // which day each stage was FOR and not merely when it went.
    expect(plan[0].claims).toEqual([
      { neededBy: '2026-08-09', stage: 1, dueOn: '2026-08-11' },
      { neededBy: '2026-08-12', stage: 0, dueOn: '2026-08-12' },
    ]);
  });

  it('speaks to the most overdue date in a combined message', () => {
    const plan = planChoiceReminders({
      today: '2026-08-12',
      choices: [
        plannable({ id: 'tile', decideBy: '2026-08-10' }),
        plannable({ id: 'faucet', decideBy: '2026-08-12' }),
      ],
    });
    // "2 choices due today" understates a message that also covers one from two
    // days ago.
    expect(plan[0].daysPastNeededBy).toBe(2);
  });

  it('splits per choice when the account is set that way', () => {
    const plan = planChoiceReminders({
      today,
      grouping: 'per_choice',
      choices: [plannable({ id: 'a' }), plannable({ id: 'b' })],
    });
    expect(plan).toHaveLength(2);
    expect(plan.map((send) => send.selectionId)).toEqual(['a', 'b']);
  });

  it('carries the job id and the send date on every message', () => {
    const [send] = planChoiceReminders({ today: '2026-08-12', choices: [plannable({ decideBy: '2026-08-10' })] });
    expect(send.jobId).toBe('job-1');
    expect(send.sendOn).toBe('2026-08-12');
    expect(send.selectionId).toBeNull();
  });

  it('records the day a late stage was FOR, not just the day it went', () => {
    // sendOn is today; the claim keeps the date the schedule actually named. A
    // ledger that recorded only the send day could not answer "was this the
    // needed-by reminder or the two-days-later one".
    const [send] = planChoiceReminders({ today: '2026-08-13', choices: [plannable({ decideBy: '2026-08-10' })] });
    expect(send.sendOn).toBe('2026-08-13');
    expect(send.claims).toEqual([{ neededBy: '2026-08-10', stage: 1, dueOn: '2026-08-12' }]);
  });
});

// -- The message -------------------------------------------------------------

describe('choiceReminderText', () => {
  const base = {
    businessName: 'BrokePipes',
    clientName: 'Sarah Kim',
    jobName: 'Lawn & Order',
    titles: ['Patio tile', 'Kitchen faucet'],
    daysPastNeededBy: 0,
    url: 'letsgetquoted.com/client/jobs/…',
  };

  it('writes the message the panel is specified to preview', () => {
    expect(choiceReminderText(base)).toBe(
      [
        'Hi Sarah, you have 2 choices due today for your Lawn & Order project:',
        '• Patio tile',
        '• Kitchen faucet',
        'Review choices: letsgetquoted.com/client/jobs/…',
        'Reply STOP to opt out.',
      ].join('\n'),
    );
  });

  it('uses the first name only', () => {
    const text = choiceReminderText(base);
    expect(text).toContain('Hi Sarah,');
    expect(text).not.toContain('Sarah Kim');
  });

  it('survives a nameless customer and a nameless job', () => {
    const text = choiceReminderText({ ...base, clientName: '  ', jobName: '' });
    expect(text).toContain('Hi there,');
    expect(text).toContain('your project project');
  });

  it('counts one choice as one choice', () => {
    expect(choiceReminderText({ ...base, titles: ['Patio tile'] })).toContain('1 choice due today');
  });

  it('says how late they are on the second reminder', () => {
    expect(choiceReminderText({ ...base, daysPastNeededBy: 2 })).toContain('now 2 days overdue');
  });

  it('always ends with the opt-out, whatever the template says', () => {
    // Not decoration — it is the reason this may be texted to a mobile at all,
    // so it is appended by the renderer where no edit can remove it.
    const stripped = choiceReminderText({ ...base, template: 'Choices waiting: {link}' });
    expect(stripped).toContain('Choices waiting: letsgetquoted.com/client/jobs/…');
    expect(stripped.endsWith(CHOICE_OPT_OUT_LINE)).toBe(true);
  });

  it('fills every placeholder the panel advertises', () => {
    const template = CHOICE_TEMPLATE_TOKENS.map((token) => token.token).join(' ');
    const text = choiceReminderText({ ...base, template });
    expect(text).not.toMatch(/\{[a-z_]+\}/);
    expect(text).toContain('BrokePipes');
    expect(text).toContain('Lawn & Order');
  });

  it('leaves an unknown placeholder standing rather than blanking it', () => {
    // A contractor who typed {name} instead of {client} should see {name} in the
    // preview and fix it, not read a sentence with a hole in it and wonder.
    expect(choiceReminderText({ ...base, template: 'Hi {name} {link}' })).toContain('{name}');
  });

  it('falls back to the default when the stored template is empty', () => {
    expect(choiceReminderText({ ...base, template: '   ' })).toBe(choiceReminderText(base));
    expect(choiceReminderText({ ...base, template: null })).toBe(choiceReminderText(base));
  });
});

describe('choiceReminderPreview', () => {
  it("is the message from the sender's own function, not a transcription", () => {
    // Every hand-written preview in this app has drifted from its sender at
    // least once. This is the assertion that stops it happening a fourth time.
    expect(choiceReminderPreview({ businessName: 'BrokePipes' })).toBe(
      choiceReminderText({
        businessName: 'BrokePipes',
        clientName: 'Sarah',
        jobName: 'Lawn & Order',
        titles: ['Patio tile', 'Kitchen faucet'],
        daysPastNeededBy: 0,
        url: 'letsgetquoted.com/client/jobs/…',
      }),
    );
  });

  it('moves when the template does, so the panel previews what is being typed', () => {
    expect(choiceReminderPreview({ businessName: 'BrokePipes', template: 'Yo {client} — {link}' }))
      .toBe('Yo Sarah — letsgetquoted.com/client/jobs/…\nReply STOP to opt out.');
  });
});

describe('validateChoiceTemplate', () => {
  it('accepts the default', () => {
    expect(validateChoiceTemplate(DEFAULT_CHOICE_REMINDER_TEMPLATE).ok).toBe(true);
  });

  it('refuses an empty message', () => {
    expect(validateChoiceTemplate('   ')).toMatchObject({ ok: false, problem: 'empty' });
  });

  it('refuses a message with no link in it', () => {
    // A text telling somebody they owe a decision, with no way to make it.
    expect(validateChoiceTemplate('You have choices waiting!')).toMatchObject({ ok: false, problem: 'no_link' });
  });

  it('refuses a message nobody would read', () => {
    expect(validateChoiceTemplate(`{link} ${'x'.repeat(CHOICE_TEMPLATE_MAX)}`))
      .toMatchObject({ ok: false, problem: 'too_long' });
  });

  it('says what is wrong, in words a contractor can act on', () => {
    expect(validateChoiceTemplate('no link here').message).toContain('{link}');
  });
});

describe('the small labels', () => {
  it('counts choices', () => {
    expect(choiceCountLabel(1)).toBe('1 choice');
    expect(choiceCountLabel(6)).toBe('6 choices');
  });

  it('says how overdue somebody is', () => {
    expect(choiceDueLabel(0)).toBe('due today');
    expect(choiceDueLabel(1)).toBe('due yesterday');
    expect(choiceDueLabel(2)).toBe('now 2 days overdue');
  });

  it('bullets the list, and never renders a nameless choice as a bare bullet', () => {
    expect(choiceListText(['Patio tile', '  '])).toBe('• Patio tile\n• Choice to make');
  });
});
