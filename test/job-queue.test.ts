import { describe, it, expect } from 'vitest';
import {
  JOB_SORTS,
  JOB_STAGES,
  jobStageLabel,
  matchesQuery,
  scheduleNote,
  sortQueue,
  stageCounts,
  todayKeyOf,
  type QueueJob,
} from '@/lib/job-queue';
import { DEFAULT_JOBS_VIEW, JOBS_VIEWS, normalizeJobsView } from '@/lib/dashboard-views';

const TODAY = '2026-08-05';

function job(over: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'j1',
    ref: 'J-1001',
    clientName: 'Dana Whitfield',
    address: '1418 S Main St, Royal Oak',
    status: 'in_progress',
    scope: 'Roof tear-off and re-shingle',
    scheduledFor: TODAY,
    quotedAmount: 4200,
    outstandingAmount: 0,
    createdAt: '2026-07-01T09:00:00Z',
    ...over,
  };
}

describe('one set of stage words', () => {
  it('names every stage the page can render', () => {
    expect(JOB_STAGES.map((s) => s.id)).toEqual(['new_lead', 'in_progress', 'complete', 'archived']);
    expect(jobStageLabel('new_lead')).toBe('New request');
    expect(jobStageLabel('in_progress')).toBe('In progress');
  });

  it('counts every job exactly once', () => {
    const jobs = [job({ status: 'new_lead' }), job({ status: 'in_progress' }), job({ status: 'in_progress' })];
    const counts = stageCounts(jobs);
    expect(counts.all).toBe(3);
    expect(counts.in_progress).toBe(2);
    expect(counts.new_lead).toBe(1);
    expect(counts.archived).toBe(0);
    expect(counts.new_lead + counts.in_progress + counts.complete + counts.archived).toBe(counts.all);
  });
});

describe('search', () => {
  it('finds a job by customer, reference, work or town', () => {
    expect(matchesQuery(job(), 'dana')).toBe(true);
    expect(matchesQuery(job(), 'J-1001')).toBe(true);
    expect(matchesQuery(job(), 'shingle')).toBe(true);
    expect(matchesQuery(job(), 'royal')).toBe(true);
  });

  // ALL terms, not any: "royal oak roof" should narrow, not widen.
  it('requires every term', () => {
    expect(matchesQuery(job(), 'royal roof')).toBe(true);
    expect(matchesQuery(job(), 'royal fence')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery(job(), '')).toBe(true);
    expect(matchesQuery(job(), '   ')).toBe(true);
  });

  it('survives a job with nothing written on it', () => {
    expect(matchesQuery(job({ scope: null, address: null }), 'dana')).toBe(true);
    expect(matchesQuery(job({ scope: null, address: null }), 'royal')).toBe(false);
  });
});

describe('"Soonest first" is not the date column ascending', () => {
  const upcoming = job({ id: 'upcoming', scheduledFor: '2026-08-09' });
  const today = job({ id: 'today', scheduledFor: TODAY });
  const undated = job({ id: 'undated', scheduledFor: null });
  const past = job({ id: 'past', scheduledFor: '2026-07-14' });
  const older = job({ id: 'older', scheduledFor: '2026-06-02' });

  // Ascending would put June at the top — a finished job from two months ago
  // outranking this morning, which is the opposite of what the word means.
  it('puts the work that is coming first', () => {
    const out = sortQueue([past, upcoming, today], 'soonest', TODAY);
    expect(out.map((j) => j.id)).toEqual(['today', 'upcoming', 'past']);
  });

  // A job nobody has booked is a job you have to do something about, so it
  // beats work that is already behind you.
  it('puts undated work above the past, below the future', () => {
    const out = sortQueue([past, undated, upcoming], 'soonest', TODAY);
    expect(out.map((j) => j.id)).toEqual(['upcoming', 'undated', 'past']);
  });

  it('reads the past most-recent-first', () => {
    const out = sortQueue([older, past], 'soonest', TODAY);
    expect(out.map((j) => j.id)).toEqual(['past', 'older']);
  });

  it('treats today as upcoming, not past', () => {
    const out = sortQueue([past, today], 'soonest', TODAY);
    expect(out[0].id).toBe('today');
  });
});

describe('the other three sorts', () => {
  it('orders by what is still owed', () => {
    const out = sortQueue(
      [job({ id: 'a', outstandingAmount: 0 }), job({ id: 'b', outstandingAmount: 900 }), job({ id: 'c', outstandingAmount: 4200 })],
      'owed',
      TODAY,
    );
    expect(out.map((j) => j.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by quoted value', () => {
    const out = sortQueue(
      [job({ id: 'small', quotedAmount: 200 }), job({ id: 'big', quotedAmount: 9000 })],
      'value',
      TODAY,
    );
    expect(out.map((j) => j.id)).toEqual(['big', 'small']);
  });

  it('orders by when it arrived', () => {
    const out = sortQueue(
      [job({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }), job({ id: 'new', createdAt: '2026-08-01T00:00:00Z' })],
      'newest',
      TODAY,
    );
    expect(out.map((j) => j.id)).toEqual(['new', 'old']);
  });

  it('never mutates the array it was given', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })];
    sortQueue(jobs, 'value', TODAY);
    expect(jobs.map((j) => j.id)).toEqual(['a', 'b']);
  });

  it('offers exactly the sorts the picker lists', () => {
    expect(JOB_SORTS.map((s) => s.id)).toEqual(['soonest', 'owed', 'value', 'newest']);
  });
});

describe('what a row says about when', () => {
  it('names the day rather than leaving it blank', () => {
    expect(scheduleNote(job({ scheduledFor: null }), TODAY)).toBe('Needs a date');
    expect(scheduleNote(job({ scheduledFor: TODAY }), TODAY)).toBe('Today');
    expect(scheduleNote(job({ scheduledFor: '2026-08-20' }), TODAY)).toBe('Upcoming');
    expect(scheduleNote(job({ scheduledFor: '2026-07-20' }), TODAY)).toBe('Past');
  });
});

describe('today is local, not UTC', () => {
  it('reads the date parts off the local clock', () => {
    // 23:30 local on the 5th is already the 6th in UTC; the key must say the 5th.
    expect(todayKeyOf(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05');
    expect(todayKeyOf(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('Jobs opens on Smoothie', () => {
  it('is the default for anyone who has never chosen', () => {
    expect(DEFAULT_JOBS_VIEW).toBe('smoothie');
    expect(normalizeJobsView(undefined)).toBe('smoothie');
    expect(normalizeJobsView(null)).toBe('smoothie');
  });

  // The load-bearing half: an explicit choice is a cookie, so nobody who picked
  // Focus, List, Board or Table is moved off it.
  it('keeps every view somebody may already have chosen', () => {
    for (const view of JOBS_VIEWS) expect(normalizeJobsView(view), view).toBe(view);
  });

  it('falls back rather than trusting a hand-edited cookie', () => {
    for (const junk of ['SMOOTHIE', 'kanban', '{}', 0, true, {}, []]) {
      expect(normalizeJobsView(junk), String(junk)).toBe(DEFAULT_JOBS_VIEW);
    }
  });
});
