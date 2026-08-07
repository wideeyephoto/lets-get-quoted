import { describe, it, expect } from 'vitest';
import { QUEUE_PAGE, queueWindow, retainedLimit } from '@/lib/queue-window';

// The Smoothie queue has no scrollbar of its own — that is the layout's one
// rule. So it has an end instead, and this is the arithmetic behind it.

const win = (over: Partial<Parameters<typeof queueWindow>[0]> = {}) =>
  queueWindow({ total: 100, limit: QUEUE_PAGE, selectedIndex: -1, plural: 'leads', ...over });

describe('how much of the queue gets drawn', () => {
  it('draws one page and says what is left', () => {
    const w = win();
    expect(w.end).toBe(25);
    expect(w.hidden).toBe(75);
    expect(w.truncated).toBe(true);
    expect(w.countLabel).toBe('Showing 25 of 100 leads');
    expect(w.moreLabel).toBe('Show 25 more');
    expect(w.allLabel).toBe('Show all 100');
  });

  // The whole point: a hundred leads used to be a hundred rows.
  it('never draws more than was asked for', () => {
    expect(win({ limit: 50 }).end).toBe(50);
    expect(win({ limit: 1000 }).end).toBe(100);
  });

  it('holds nothing back when the list fits', () => {
    const w = win({ total: 9 });
    expect(w.end).toBe(9);
    expect(w.hidden).toBe(0);
    expect(w.truncated).toBe(false);
    expect(w.step).toBe(0);
  });

  it('handles an empty list without going negative', () => {
    const w = win({ total: 0 });
    expect(w.end).toBe(0);
    expect(w.hidden).toBe(0);
    expect(w.truncated).toBe(false);
  });

  // The last reveal is a part page, and the button has to say so rather than
  // promising 25 rows and producing 3.
  it('offers only what is actually left on the last step', () => {
    const w = win({ total: 28 });
    expect(w.step).toBe(3);
    expect(w.moreLabel).toBe('Show 3 more');
  });
});

describe('the selected row is always drawn', () => {
  // A map pin, a deep link or the keyboard can select a row far past the
  // window. Left out of the list, the orange row that is this view's only "you
  // are here" marker is simply absent, and the queue looks like nothing is
  // selected at all.
  it('opens the window far enough to include it', () => {
    const w = win({ selectedIndex: 60 });
    expect(w.end).toBe(61);
    expect(w.hidden).toBe(39);
  });

  it('changes nothing when the selection is already on screen', () => {
    expect(win({ selectedIndex: 4 }).end).toBe(25);
    expect(win({ selectedIndex: 24 }).end).toBe(25);
  });

  it('draws no extra row when nothing is selected', () => {
    expect(win({ selectedIndex: -1 }).end).toBe(25);
  });

  // Filtered away: the selection is a real lead the pane still shows, it just
  // is not in this list. -1 must not be read as "row 0" or as "row 100".
  it('does not let a missing selection widen or shrink the window', () => {
    expect(win({ selectedIndex: -1, limit: 40 }).end).toBe(40);
  });

  it('still cannot exceed the list', () => {
    expect(win({ total: 30, selectedIndex: 29 }).end).toBe(30);
  });
});

describe('numbers that arrive wrong', () => {
  it('falls back to a page rather than drawing nothing', () => {
    expect(win({ limit: Number.NaN }).end).toBe(25);
    expect(win({ limit: 0 }).end).toBe(1);
    expect(win({ limit: -5 }).end).toBe(1);
  });

  it('treats a negative total as empty', () => {
    expect(win({ total: -3 }).end).toBe(0);
    expect(win({ total: -3 }).hidden).toBe(0);
  });

  it('rounds fractions down instead of slicing on a fraction', () => {
    expect(win({ limit: 25.9 }).end).toBe(25);
    expect(win({ total: 30.9 }).hidden).toBe(5);
  });

  it('honours a custom page size', () => {
    const w = win({ pageSize: 10 });
    expect(w.end).toBe(25); // limit still governs what is drawn
    expect(w.step).toBe(10); // the page size governs the next step
  });
});

describe('the window never shrinks under a moving selection', () => {
  // The bug this exists to stop: `end` is derived from selectedIndex, so
  // arrowing DOWN past the page grew the window one row at a time — and
  // arrowing back UP shrank it again, unmounting each row as the reader
  // stepped off it. The list ate itself from the bottom as you walked back
  // through it.
  it('remembers whatever the selection opened', () => {
    let limit = QUEUE_PAGE;

    // Down to row 45.
    for (let i = 0; i <= 44; i += 1) {
      limit = retainedLimit(limit, win({ limit, selectedIndex: i }).end);
    }
    expect(limit).toBe(45);

    // Back up to the top. Every one of those rows is still drawn.
    for (let i = 44; i >= 0; i -= 1) {
      const w = win({ limit, selectedIndex: i });
      expect(w.end, `row ${i} shrank the window`).toBe(45);
      limit = retainedLimit(limit, w.end);
    }
    expect(limit).toBe(45);
  });

  // A map pin at row 60 opens the window in one jump. Clicking a row near the
  // top afterwards must not throw away the 35 rows that came with it.
  it('holds a jump open when the next click is near the top', () => {
    const afterPin = retainedLimit(QUEUE_PAGE, win({ selectedIndex: 60 }).end);
    expect(afterPin).toBe(61);
    expect(win({ limit: afterPin, selectedIndex: 2 }).end).toBe(61);
  });

  it('is a no-op when the selection is already inside the window', () => {
    expect(retainedLimit(50, 25)).toBe(50);
    expect(retainedLimit(25, 25)).toBe(25);
  });
});

describe('the words', () => {
  it('counts the right noun for each page that shares this module', () => {
    expect(win({ plural: 'jobs' }).countLabel).toBe('Showing 25 of 100 jobs');
    expect(win({ plural: 'customers' }).countLabel).toBe('Showing 25 of 100 customers');
  });

  // countLabel reports the FILTERED total, not the account's total. "Showing 25
  // of 100" beside a queue header reading "40 of 100" would be two different
  // claims about the same list.
  it('counts what matched, not everything', () => {
    expect(win({ total: 40 }).countLabel).toBe('Showing 25 of 40 leads');
  });
});
