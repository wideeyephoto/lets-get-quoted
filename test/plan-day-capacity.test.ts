import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scheduleOrder, formatClockLabel } from '@/lib/route-plan';
import { toPlanStop, type PlanJobRow } from '@/lib/route-plan-day';

/**
 * A day cannot hold more than a day, and the page has to say which problem it is.
 *
 * REPORTED: "Schedule runs 9 hr 2 min past your 5:00 PM finish · The last stop
 * is expected to finish around 2:02 AM +1d." Both sentences were true and
 * neither was useful. A contractor reads them as "work late", squints at the
 * last stop and starts looking for twenty minutes to save.
 *
 * The cause is not one long stop. dayLoad divides a multi-day job's hours by its
 * days IN ISOLATION, so two multi-day jobs landing on the same day are each
 * handed a full working day and the router stacks them: 16 hours of work in a
 * 9-hour window, with the second stop starting at 4:57 PM on a day that ends at
 * 5:00. That is not an overrun. It is an impossible day, and starting earlier
 * cannot fix it — the only fix is to move one of them.
 */

const JOB: PlanJobRow = {
  id: 'a',
  client_name: 'Clay',
  client_phone: null,
  address: '861 SW Oldham Pkwy',
  lat: 38.8,
  lng: -94.5,
  scheduled_for: '2026-08-10',
  scheduled_until: '2026-08-11',
  scheduled_time: '08:00',
  estimated_hours: 16,
  status: 'scheduled',
  appointment_confirmed_at: null,
};

const DAY = { workdayStart: '08:00', workdayEnd: '17:00', bufferMinutes: 0, defaultVisitMinutes: 120 };

function planTwoFullDays() {
  const a = toPlanStop(JOB, 120, { placement: { day: 1, of: 2 }, capacityHours: 8 });
  const b = toPlanStop({ ...JOB, id: 'b', client_name: 'Naomi', lat: 39.1, lng: -94.4 }, 120, {
    placement: { day: 1, of: 2 },
    capacityHours: 8,
  });
  return {
    a,
    b,
    plan: scheduleOrder(['a', 'b'], { ...DAY, stops: [a, b], homeBase: { lat: 38.9, lng: -94.5 } }),
  };
}

describe('when the day holds less than the work on it', () => {
  it('reproduces the reported day', () => {
    const { a, b, plan } = planTwoFullDays();
    // Each job's own share is right — 16 hours over two days is eight today.
    expect(a.visitMinutes).toBe(480);
    expect(b.visitMinutes).toBe(480);
    // And together they are twice a day, which is the whole problem.
    expect(plan.workMinutes).toBe(960);
    expect(plan.overflowMinutes).toBeGreaterThan(400);
    expect(formatClockLabel(plan.finishMinutes)).toMatch(/\+1d$/);
  });

  it('reports the day’s length, not only how far past it went', () => {
    // 8:00–17:00. The pair — what the day holds against what is on it — is what
    // makes "move a job" the obvious move rather than "start earlier".
    const { plan } = planTwoFullDays();
    expect(plan.dayMinutes).toBe(540);
    expect(plan.workMinutes + Math.round(plan.minutes)).toBeGreaterThan(plan.dayMinutes);
  });

  it('names the stop that cannot be finished, not the one that starts late', () => {
    // "Starts after the day ends" was the obvious measure and the wrong one: in
    // the reported day the second stop began at 4:57 PM — three minutes INSIDE
    // a day ending at 5:00 — and was then worked until 12:57 AM.
    const { plan } = planTwoFullDays();
    expect(plan.unfinishedByDayEnd).toEqual(['b']);
  });

  it('leaves an ordinary day alone', () => {
    const a = toPlanStop({ ...JOB, estimated_hours: 3, scheduled_until: null }, 120, { capacityHours: 8 });
    const b = toPlanStop({ ...JOB, id: 'b', estimated_hours: 2, scheduled_until: null, lat: 39.1, lng: -94.4 }, 120, {
      capacityHours: 8,
    });
    const plan = scheduleOrder(['a', 'b'], { ...DAY, stops: [a, b], homeBase: { lat: 38.9, lng: -94.5 } });
    expect(plan.overflowMinutes).toBe(0);
    expect(plan.unfinishedByDayEnd).toEqual([]);
    expect(plan.workMinutes + Math.round(plan.minutes)).toBeLessThan(plan.dayMinutes);
  });
});

describe('capacity cannot exceed the working day it sits in', () => {
  it('takes the smaller of schedule_day_hours and the workday', () => {
    // Two independent settings that nothing stopped disagreeing: a 10-hour
    // capacity on an 08:00–17:00 day says a job may take ten hours of a
    // nine-hour day.
    const SRC = readFileSync('src/lib/route-plan-day.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(SRC).toContain('scheduleDayHours: Math.min(');
    expect(SRC).toContain("parseTimeMinutes((data?.workday_end as string) || '17:00')");
  });
});

describe('the page says which of the two problems it is', () => {
  const SRC = readFileSync('src/app/dashboard/schedule/plan/DayPlanner.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('leads with the day’s capacity when the day is overloaded', () => {
    expect(SRC).toContain('of work and driving on a');
    expect(SRC).toContain('Something has to move —');
    expect(SRC).toContain('starting earlier cannot fix it');
  });

  it('keeps the plain overrun wording for a day that merely runs late', () => {
    expect(SRC).toContain('Schedule runs ${minutesLabel(plan.overflowMinutes)} past your');
  });

  it('flags the stop on its own row', () => {
    expect(SRC).toContain('Cannot be finished today');
    expect(SRC).toContain('startsAfterDayEnd={strandedIds.has(entry.stop.id)}');
  });
});

/**
 * SAYING SO IS NOT A NEXT STEP.
 *
 * The page named the problem well and then left the contractor to solve it:
 * "Cannot be finished today" was a label, and the only actions were "Adjust the
 * day" (scroll down) and "Move the last job" (open a job page and find the date
 * field). Meanwhile the product already has the flow this needs — ask that
 * customer to take another day, with the days that have room, how far each is
 * from work already booked, and a discount if you want to offer one.
 *
 * Reported from a real plan: a stop finishing at 1:23 AM, correctly flagged and
 * with nothing to press.
 */
describe('the day that cannot be finished offers a way out of it', () => {
  const SRC = readFileSync('src/app/dashboard/schedule/plan/DayPlanner.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('makes the badge itself the action', () => {
    expect(SRC).toContain('className="plan-badge warn is-action"');
    expect(SRC).toContain('Cannot be finished today — ask them to move');
    // And says what is happening when one has already gone out, rather than
    // offering to send it twice.
    expect(SRC).toContain('Cannot be finished today — waiting on their reply');
  });

  /**
   * The gate on the ⋮ menu item is "does moving this save enough driving to be
   * worth asking" — right for a stop that is merely out of the way, wrong for
   * one the day cannot finish, where the reason is that it does not fit.
   */
  it('does not gate the stranded stop on how much driving it saves', () => {
    expect(SRC).toContain("(stopId: string, reason: 'saves_driving' | 'stranded' = 'saves_driving')");
    expect(SRC).toContain("if (reason === 'stranded') return true;");
    expect(SRC).toContain("strandedIds.has(entry.stop.id) ? 'stranded' : 'saves_driving'");
  });

  /** A customer-confirmed time still blocks it: they agreed to a slot. */
  it('still refuses to offer on a confirmed appointment', () => {
    expect(SRC).toMatch(/if \(!stop \|\| stop\.locked\) return false;[\s\S]{0,120}if \(reason === 'stranded'\)/);
  });

  it('names the stop the day cannot finish, not just the last one', () => {
    expect(SRC).toContain('const strandedJob = stranded.filter((entry) => !isRouteStopId(entry.stop.id)).pop() ?? lastJob;');
    expect(SRC).toContain('Ask {strandedJob.stop.label} to move day');
    expect(SRC).toContain('`Move ${strandedJob.stop.label} myself`');
    expect(SRC).not.toContain('Move the last job\n');
  });
});
