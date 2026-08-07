'use client';

import { useCallback, useState } from 'react';
import { QUEUE_PAGE, queueWindow, retainedLimit, type QueueWindow } from '@/lib/queue-window';

/**
 * The stateful half of @/lib/queue-window: how many rows the reader has asked
 * for, and the two ways they ask for more.
 *
 * Shared by all three Smoothie queues, as the stylesheet under them already is.
 * The arithmetic and the wording live in the lib module so they can be tested
 * without a DOM; only the state lives here.
 */

export type QueueWindowControls = QueueWindow & {
  /** Reveal one more page. */
  showMore: () => void;
  /** Reveal the rest, however many that is. */
  showAll: () => void;
  /**
   * The index of the first row a reveal would add — where to send focus, so
   * revealing from the keyboard lands on the new rows instead of on nothing
   * when the button that had focus disappears.
   */
  nextIndex: number;
};

export function useQueueWindow(input: {
  /** Rows matching the current filters. */
  total: number;
  /** Where the selection sits in that same filtered list, or -1. */
  selectedIndex: number;
  /**
   * Anything that changes WHICH rows are in the list — stage, sort, search.
   * When it changes the window drops back to one page: "show all" was asked
   * about the previous list, not this one.
   */
  resetKey: string;
  plural: string;
  pageSize?: number;
}): QueueWindowControls {
  const pageSize = input.pageSize ?? QUEUE_PAGE;
  const [limit, setLimit] = useState(pageSize);

  // Adjusted during render rather than in an effect. An effect would let one
  // paint through with the previous window applied to the new list — a hundred
  // rows appearing for a frame is exactly the thing this module exists to stop.
  const [lastKey, setLastKey] = useState(input.resetKey);
  const resetting = lastKey !== input.resetKey;
  if (resetting) {
    setLastKey(input.resetKey);
    setLimit(pageSize);
  }

  // `limit` is still the OLD value on the render that resets it — setting state
  // during render re-runs the component, it does not rewrite the const already
  // read. Rendering the new list against the old window for one pass is the
  // flash this whole branch exists to avoid, so use the value being set.
  const asked = resetting ? pageSize : limit;

  const win = queueWindow({
    total: input.total,
    limit: asked,
    selectedIndex: input.selectedIndex,
    pageSize,
    plural: input.plural,
  });

  // Keep whatever the selection opened. Without this the window is a function
  // of where the cursor is rather than of what has been shown, and moving the
  // selection back up the queue unmounts rows the reader was already given —
  // see retainedLimit. Skipped while resetting: the filters just changed, and
  // remembering the previous list's window is the thing the reset undoes.
  if (!resetting && retainedLimit(limit, win.end) !== limit) {
    setLimit(retainedLimit(limit, win.end));
  }

  // Grows from what is on screen, not from `limit`. The two differ whenever the
  // selection has forced the window open past it, and growing `limit` there can
  // land back inside the window it already reached — a button that does nothing.
  const end = win.end;
  const showMore = useCallback(() => setLimit(end + pageSize), [end, pageSize]);
  const showAll = useCallback(() => setLimit(Number.MAX_SAFE_INTEGER), []);

  return { ...win, showMore, showAll, nextIndex: end };
}

/**
 * Move focus to a queue row that may have only just been revealed.
 *
 * A row already on screen is focused synchronously, as it always was. A row past
 * the window's edge is not in the DOM yet — the state change that reveals it has
 * not been committed — so getElementById returns null and focus is silently
 * dropped onto the body. rAF runs after the commit, which is the same trick the
 * mobile Back button already uses.
 */
export function focusQueueRow(elementId: string, onScreen: boolean): void {
  const go = () => document.getElementById(elementId)?.focus();
  if (onScreen) go();
  else requestAnimationFrame(go);
}
