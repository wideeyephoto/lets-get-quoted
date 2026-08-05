import { describe, expect, it } from 'vitest';
import {
  countStates,
  needsAttention,
  normalizePostStatus,
  postDateLabel,
  postState,
  shouldAutoPublish,
  STORED_POST_STATUSES,
  todayKeyOf,
  type StatefulPost,
} from '@/lib/marketing-status';

const TODAY = '2026-08-05';

function post(over: Partial<StatefulPost & { date: string; title: string }> = {}) {
  return { status: 'draft' as const, publishAt: '', date: TODAY, title: 'A post', ...over };
}

describe('five names for where a post is', () => {
  it('reads the four stored ones back', () => {
    expect(postState(post({ status: 'draft' }), TODAY)).toBe('draft');
    expect(postState(post({ status: 'ready' }), TODAY)).toBe('ready');
    expect(postState(post({ status: 'published' }), TODAY)).toBe('published');
    expect(postState(post({ status: 'archived' }), TODAY)).toBe('archived');
  });

  // Scheduled is derived so publishAt stays the ONE thing scheduling depends on.
  it('derives scheduled from a future date, on a draft or a ready post', () => {
    expect(postState(post({ status: 'draft', publishAt: '2026-09-12' }), TODAY)).toBe('scheduled');
    expect(postState(post({ status: 'ready', publishAt: '2026-09-12' }), TODAY)).toBe('scheduled');
  });

  it('does not call a date that has already passed "scheduled"', () => {
    // It either went out, or the cron has not run. Saying "scheduled" would tell
    // somebody to keep waiting for something that already happened.
    expect(postState(post({ status: 'draft', publishAt: '2026-07-01' }), TODAY)).toBe('draft');
    expect(postState(post({ status: 'ready', publishAt: '2026-07-01' }), TODAY)).toBe('ready');
  });

  it('treats today as not-yet-future, so the cron owns the boundary day', () => {
    expect(postState(post({ status: 'draft', publishAt: TODAY }), TODAY)).toBe('draft');
  });

  it('never calls a published or archived post scheduled, whatever date it holds', () => {
    expect(postState(post({ status: 'published', publishAt: '2026-09-12' }), TODAY)).toBe('published');
    expect(postState(post({ status: 'archived', publishAt: '2026-09-12' }), TODAY)).toBe('archived');
  });
});

describe('an unknown status fails safe', () => {
  it('keeps the four real ones', () => {
    for (const status of STORED_POST_STATUSES) expect(normalizePostStatus(status)).toBe(status);
  });

  // Draft is the only state that is never public and never auto-publishes.
  it('falls back to draft rather than anything that could go out', () => {
    for (const junk of ['live', 'LIVE', 'scheduled', '', null, undefined, 0, {}, []]) {
      expect(normalizePostStatus(junk), String(junk)).toBe('draft');
    }
  });

  it('is case and whitespace tolerant on the real ones', () => {
    expect(normalizePostStatus(' Published ')).toBe('published');
    expect(normalizePostStatus('ARCHIVED')).toBe('archived');
  });
});

describe('what the nightly cron may publish', () => {
  it('publishes a draft or a ready post whose day has come', () => {
    expect(shouldAutoPublish(post({ status: 'draft', publishAt: '2026-08-05' }), TODAY)).toBe(true);
    expect(shouldAutoPublish(post({ status: 'ready', publishAt: '2026-08-01' }), TODAY)).toBe(true);
  });

  it('leaves the future alone', () => {
    expect(shouldAutoPublish(post({ status: 'ready', publishAt: '2026-09-01' }), TODAY)).toBe(false);
  });

  // The reason shouldAutoPublish exists at all. The cron's own test was
  // `status !== 'published'`, which republishes anything archived that still
  // holds a date — a post somebody deliberately took down putting itself back up.
  it('NEVER republishes something archived, however stale its date', () => {
    expect(shouldAutoPublish(post({ status: 'archived', publishAt: '2026-01-01' }), TODAY)).toBe(false);
  });

  it('ignores a post with no date and one with a garbled date', () => {
    expect(shouldAutoPublish(post({ status: 'ready', publishAt: '' }), TODAY)).toBe(false);
    expect(shouldAutoPublish(post({ status: 'ready', publishAt: 'soon' }), TODAY)).toBe(false);
  });
});

describe('counts', () => {
  it('counts every post exactly once', () => {
    const posts = [
      post({ status: 'draft' }),
      post({ status: 'ready' }),
      post({ status: 'ready', publishAt: '2026-09-12' }),
      post({ status: 'published' }),
      post({ status: 'archived' }),
    ];
    const counts = countStates(posts, TODAY);
    expect(counts.all).toBe(5);
    expect(counts.draft + counts.ready + counts.scheduled + counts.published + counts.archived).toBe(counts.all);
    expect(counts.scheduled).toBe(1);
    expect(counts.ready).toBe(1);
  });

  it('is all zeroes for no posts', () => {
    expect(countStates([], TODAY)).toEqual({ all: 0, draft: 0, ready: 0, scheduled: 0, published: 0, archived: 0 });
  });
});

describe('a date that says which date it is', () => {
  it('names the event, not just the day', () => {
    expect(postDateLabel(post({ status: 'published', date: '2026-07-22' }), TODAY)).toBe('Published Jul 22');
    expect(postDateLabel(post({ status: 'ready', publishAt: '2026-09-12' }), TODAY)).toBe('Scheduled for Sep 12');
    expect(postDateLabel(post({ status: 'draft', date: '2026-08-04' }), TODAY)).toBe('Updated Aug 4');
  });

  it('survives a post with no date at all', () => {
    expect(postDateLabel(post({ status: 'draft', date: '' }), TODAY)).toBe('Not saved yet');
    expect(postDateLabel(post({ status: 'published', date: '' }), TODAY)).toBe('Published');
  });
});

describe('needs attention', () => {
  it('counts drafts and posts whose date came and went', () => {
    const posts = [
      post({ status: 'draft' }),
      post({ status: 'draft' }),
      post({ status: 'ready', publishAt: '2026-08-01' }), // overdue
      post({ status: 'published' }),
      post({ status: 'ready', publishAt: '2026-09-12' }), // scheduled, fine
    ];
    const attention = needsAttention(posts, TODAY);
    expect(attention.drafts).toBe(2);
    expect(attention.overdue).toBe(1);
    expect(attention.total).toBe(3);
  });

  it('does not count an archived post as overdue', () => {
    expect(needsAttention([post({ status: 'archived', publishAt: '2026-01-01' })], TODAY).overdue).toBe(0);
  });

  it('is zero on a tidy blog', () => {
    expect(needsAttention([post({ status: 'published' })], TODAY).total).toBe(0);
  });
});

describe('today is local, not UTC', () => {
  it('reads the date parts off the local clock', () => {
    // 23:30 local on the 5th is already the 6th in UTC.
    expect(todayKeyOf(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05');
    expect(todayKeyOf(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
