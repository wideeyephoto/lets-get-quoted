/**
 * How much of a Smoothie queue to actually draw.
 *
 * Smoothie has one layout rule, stated at the top of dashboard/smoothie.module.css:
 * nothing inside it gets its own scrollbar. The queue grows and the PAGE scrolls,
 * because a list with `overflow-y: auto` inside a page that also scrolls gives
 * you two wheels under one cursor.
 *
 * That rule holds at twenty leads. At a hundred it stops being a rule and starts
 * being a seven-thousand-pixel column beside a detail pane a fifth its height —
 * and everything below the queue (the add form, the set-aside drawer) is now
 * ninety rows further down the page than it was.
 *
 * So the list gets an END rather than a scrollbar: one page of rows, and a
 * control that says how many are left. The reader asks for more instead of being
 * handed all of them. The rule survives, and so does the page.
 *
 * Pure, and noun-agnostic, so Leads, Jobs and Clients share one set of numbers
 * and one set of words — the same reason lead-queue owns the stage labels rather
 * than each view spelling them out. Three copies of this would drift.
 */

/** One page. Roughly the height of the detail pane beside it. */
export const QUEUE_PAGE = 25;

export type QueueWindow = {
  /** How many rows to render: `rows.slice(0, end)`. */
  end: number;
  /** Rows that match the filters and are being held back. */
  hidden: number;
  /** How many the reveal button adds — a page, or whatever is left of one. */
  step: number;
  /** Whether anything is held back at all. False means: draw no control. */
  truncated: boolean;
  /** "Show 25 more" */
  moreLabel: string;
  /** "Show all 100" */
  allLabel: string;
  /** "Showing 25 of 100 leads" */
  countLabel: string;
};

export function queueWindow(input: {
  /** Rows matching the current filters — NOT the unfiltered total. */
  total: number;
  /** How many rows the reader has asked for so far. */
  limit: number;
  /**
   * Where the selected row sits in that same filtered list, or -1 for none.
   *
   * The selected row is always drawn, however far down it is. A selection you
   * cannot see in the queue — arrived at from a map pin, a deep link or the
   * keyboard — reads as nothing being selected at all, and the orange row that
   * is the view's only "you are here" marker is simply absent.
   */
  selectedIndex?: number;
  pageSize?: number;
  /** 'leads' | 'jobs' | 'customers' — what the count is counting. */
  plural: string;
}): QueueWindow {
  const pageSize = clamp(input.pageSize, QUEUE_PAGE, 1);
  const total = clamp(input.total, 0, 0);
  const asked = clamp(input.limit, pageSize, 1);
  const selected = clamp(input.selectedIndex, -1, -1);

  const end = Math.min(total, Math.max(asked, selected + 1));
  const hidden = total - end;
  const step = Math.min(pageSize, hidden);

  return {
    end,
    hidden,
    step,
    truncated: hidden > 0,
    moreLabel: `Show ${step} more`,
    allLabel: `Show all ${total}`,
    countLabel: `Showing ${end} of ${total} ${input.plural}`,
  };
}

/**
 * The limit to remember once `win` has been drawn.
 *
 * `end` is derived from the selection, and a selection MOVES. Without this the
 * window would shrink again the moment the selection came back up the list:
 * arrow down past row 25 to row 45, arrow back up, and rows 26-45 unmount one
 * per keystroke — the reader watching the bottom of the queue eat itself as
 * they walk back through it. A map pin or a deep link to row 60 has the same
 * ending, all at once, on the next click.
 *
 * So the window is a high-water mark, not a function of where the cursor
 * happens to be. It only ever falls when the FILTERS change, which is a
 * different list and a fair place to start over.
 */
export function retainedLimit(currentLimit: number, end: number): number {
  return Math.max(currentLimit, end);
}

/** Floor to an integer, falling back for undefined/NaN, then floor at `min`. */
function clamp(value: number | undefined, fallback: number, min: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, n);
}
