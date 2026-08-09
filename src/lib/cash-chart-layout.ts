/**
 * The geometry of the cash-flow chart, separated from the drawing of it.
 *
 * All of it is pure and takes a width, so "does this fit on a 320px phone" is a
 * question with an arithmetic answer rather than one you settle by squinting at
 * a screenshot. The chart itself measures its container and hands the number in.
 *
 * The thing this file exists to prevent: a 76px Y-axis gutter and a 22px right
 * margin were fine on a 760px desktop chart and left 222px of plot at 320px —
 * less than a third of the width — with 90 days of markers 2.4px apart inside
 * it. Every touch target overlapped every neighbour, so the day you tapped was
 * whichever one happened to render last.
 */

/** Below this the chart is laid out for a thumb. */
export const MOBILE_MAX = 560;

/**
 * WCAG 2.5.8 asks for 24×24; Apple and Google both say 44. This is the number
 * the grouping below is built around: two markers closer together than this
 * cannot both be hit, so they become one.
 *
 * 32 on a mouse, where the pointer is a pixel and the extra room only costs
 * detail.
 */
export const MIN_TOUCH = 32;

/**
 * …AND 44 UNDER A THUMB.
 *
 * A single constant meant the phone inherited the mouse's number, so markers on
 * the width where fingers are the only input were 32px — under both platform
 * guidelines and the size the rest of this page is being held to. Raising it
 * costs granularity rather than reach: the grouping uses the same figure, so
 * two markers that can no longer both be hit become one marker that says "3"
 * and a panel that lists all three.
 */
export function touchSize(width: number): number {
  return width < MOBILE_MAX ? 44 : MIN_TOUCH;
}

export type ChartPadding = { top: number; right: number; bottom: number; left: number };

/**
 * Room for the axes.
 *
 * Mobile numbers are the ones that matter: 54px on the left is exactly enough
 * for "−$10k" at the axis font size, and no more, because every pixel here comes
 * straight out of the plot. Desktop keeps the width it always had — the labels
 * are unabbreviated there, and "$15,000" genuinely needs it.
 */
export function chartPadding(width: number): ChartPadding {
  return width < MOBILE_MAX
    ? { top: 20, right: 18, bottom: 34, left: 54 }
    : { top: 18, right: 22, bottom: 30, left: 76 };
}

/**
 * The narrowest the chart is allowed to draw itself.
 *
 * Not a design choice — a floor to keep the arithmetic above from going negative
 * in a container that is briefly zero-width (a panel mid-collapse, a tab that
 * has not been shown yet). It has to stay BELOW any container we really render
 * into: at a 320px viewport the page chrome leaves this chart about 198px, and a
 * floor above that makes the SVG wider than the box it lives in, which
 * `overflow: hidden` then crops. Measured, not guessed.
 */
export const MIN_CHART_WIDTH = 180;

/** What the chart should draw itself at, given whatever its container reports. */
export function resolveChartWidth(containerWidth: number | null | undefined): number {
  const measured = Math.round(Number(containerWidth) || 0);
  return Math.max(MIN_CHART_WIDTH, measured);
}

/**
 * How far the first and last points sit inside the plot.
 *
 * A marker centred on the clip boundary is drawn as half a diamond, and its
 * touch target is half-width too. The inset has to be at least half a touch
 * target or the end points are harder to hit than the middle ones — which is
 * backwards, because the first and last days are the two people look for.
 */
export function chartInset(width: number): number {
  return width < MOBILE_MAX ? touchSize(width) / 2 : 18;
}

export function chartHeight(width: number): number {
  return width < MOBILE_MAX ? 250 : 340;
}

/** "$15,000" — the desktop axis, and every readout at every width. */
export function fullMoney(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

/**
 * "$15k" — the mobile axis only.
 *
 * Never used for a figure somebody might act on. Rounding $9,800 to "$10k" on an
 * axis is a gridline; doing it in the readout is telling a contractor they have
 * two hundred dollars they do not have.
 */
export function compactMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  const abs = Math.abs(rounded);
  if (abs === 0) return '$0';
  if (abs < 1000) return `${sign}$${abs}`;
  const thousands = abs / 1000;
  // One decimal only when it changes the reading: 1.5k stays, 15.0k becomes 15k.
  const text = thousands >= 10 || Number.isInteger(thousands)
    ? String(Math.round(thousands))
    : String(Math.round(thousands * 10) / 10);
  return `${sign}$${text}k`;
}

export function axisMoney(value: number, width: number): string {
  return width < MOBILE_MAX ? compactMoney(value) : fullMoney(value);
}

/**
 * Which days get an X-axis label.
 *
 * The first and the last are always in — they are the span, and a chart whose
 * axis starts at "Aug 4" tells you nothing about when it starts. Between them,
 * evenly spaced, and any tick that would land close enough to the last one to
 * overprint is dropped rather than drawn on top of it.
 */
export function xAxisTicks(dayCount: number, width: number): number[] {
  if (dayCount <= 0) return [];
  const last = dayCount - 1;
  if (last <= 0) return [0];

  const target = width < MOBILE_MAX ? 3 : 7;
  if (dayCount <= target) return Array.from({ length: dayCount }, (_, index) => index);

  const step = last / (target - 1);
  const ticks: number[] = [0];
  for (let n = 1; n < target - 1; n += 1) {
    const index = Math.round(n * step);
    // Only if it clears both neighbours by most of a step, or two labels collide.
    if (index - ticks[ticks.length - 1] >= step * 0.6 && last - index >= step * 0.6) ticks.push(index);
  }
  ticks.push(last);
  return ticks;
}

export type MarkerDay = {
  index: number;
  dateKey: string;
  events: unknown[];
};

export type MarkerGroup<T extends MarkerDay> = {
  /** The day the group is anchored on, and what `onSelect` reports. */
  index: number;
  /** Every day folded into this marker, in order. */
  days: T[];
  /** How many transactions across all of them. */
  eventCount: number;
  /** True once it stands for more than one transaction — the badge case. */
  grouped: boolean;
};

/**
 * Fold markers that would land on top of each other into one.
 *
 * PRESENTATIONAL ONLY. Nothing here touches a balance: every day keeps its own
 * projection and its own events, and the group just carries the list. What it
 * changes is how many things you can aim at.
 *
 * Two markers closer together than a touch target cannot both be tapped, so
 * drawing both is a promise the chart cannot keep — one of them wins by paint
 * order and the other is a 3px sliver that looks interactive and is not. A
 * single marker saying "3" is honest about what is under your thumb, and the
 * panel below can then list all three.
 */
export function groupMarkers<T extends MarkerDay>(
  days: T[],
  xFor: (index: number) => number,
  minGap = MIN_TOUCH,
): MarkerGroup<T>[] {
  const withEvents = days.filter((day) => day.events.length > 0);
  const groups: MarkerGroup<T>[] = [];

  for (const day of withEvents) {
    const previous = groups[groups.length - 1];
    // Measured from the group's ANCHOR, not from the last day added. Chaining
    // off the last one lets a run of evenly-spaced days swallow the whole axis
    // into a single marker one 31px hop at a time.
    if (previous && Math.abs(xFor(day.index) - xFor(previous.index)) < minGap) {
      previous.days.push(day);
      previous.eventCount += day.events.length;
      previous.grouped = true;
      continue;
    }
    groups.push({
      index: day.index,
      days: [day],
      eventCount: day.events.length,
      // A single day carrying two transactions is already a group — it has more
      // than one thing to show, which is what the badge means.
      grouped: day.events.length > 1,
    });
  }

  return groups;
}

/** The group a given day index belongs to, for restoring a selection. */
export function groupForIndex<T extends MarkerDay>(groups: MarkerGroup<T>[], index: number | null): MarkerGroup<T> | null {
  if (index === null) return null;
  return groups.find((group) => group.days.some((day) => day.index === index)) ?? null;
}

/**
 * Keep a floating label inside the plot.
 *
 * Returns the x the label should be drawn at and which way it should point. The
 * buffer pill is pinned to the right edge, which is fine until the plot is
 * 220px wide and a "$10,000" pill is 58px of it hanging over the axis.
 */
export function flipInside(
  anchorX: number,
  labelWidth: number,
  plotLeft: number,
  plotRight: number,
): { x: number; side: 'left' | 'right' } {
  // Prefer opening leftwards from the anchor, as it does today.
  if (anchorX - labelWidth >= plotLeft) return { x: anchorX - labelWidth, side: 'left' };
  // Not enough room: open rightwards instead, and clamp so it cannot pass the
  // far edge either — on a very narrow plot neither side fits and the label has
  // to simply sit inside.
  return { x: Math.max(plotLeft, Math.min(anchorX, plotRight - labelWidth)), side: 'right' };
}
