import { describe, expect, it } from 'vitest';
import {
  axisMoney,
  chartInset,
  chartPadding,
  compactMoney,
  flipInside,
  fullMoney,
  groupForIndex,
  MIN_CHART_WIDTH,
  resolveChartWidth,
  groupMarkers,
  MIN_TOUCH,
  MOBILE_MAX,
  xAxisTicks,
  type MarkerDay,
} from '@/lib/cash-chart-layout';

const WIDTHS = { tiny: 320, phone: 390, tablet: 768, desktop: 1100 };

function day(index: number, events = 1): MarkerDay {
  return { index, dateKey: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`, events: Array.from({ length: events }, (_, i) => i) };
}

/** What the chart itself computes, so the tests measure the real plot. */
function plotWidth(width: number): number {
  const pad = chartPadding(width);
  return Math.max(10, width - pad.left - pad.right) - chartInset(width) * 2;
}

describe('the chart fits a phone', () => {
  it('reserves the margins the layout asks for on mobile', () => {
    const pad = chartPadding(WIDTHS.tiny);
    expect(pad.left).toBeGreaterThanOrEqual(52);
    expect(pad.left).toBeLessThanOrEqual(56);
    expect(pad.right).toBeGreaterThanOrEqual(16);
    expect(pad.right).toBeLessThanOrEqual(20);
    expect(pad.top).toBe(20);
    expect(pad.bottom).toBeGreaterThanOrEqual(32);
    expect(pad.bottom).toBeLessThanOrEqual(36);
  });

  it('leaves a real plot at 320px rather than a sliver', () => {
    // The old fixed padding left 222px of the 320 for the plot before the inset.
    // Anything under about half the width is not a chart, it is a gutter.
    expect(plotWidth(WIDTHS.tiny)).toBeGreaterThan(WIDTHS.tiny * 0.5);
  });

  it('never lets the axes exceed the width at any size we support', () => {
    for (const width of [320, 360, 390, 430, 560, 768, 1100, 1600]) {
      const pad = chartPadding(width);
      expect(pad.left + pad.right, `${width}px`).toBeLessThan(width);
      expect(plotWidth(width), `${width}px`).toBeGreaterThan(0);
    }
  });

  it('keeps the desktop layout it always had', () => {
    expect(chartPadding(WIDTHS.desktop)).toEqual({ top: 18, right: 22, bottom: 30, left: 76 });
    expect(chartInset(WIDTHS.desktop)).toBe(18);
  });

  it('switches at the documented breakpoint, not somewhere near it', () => {
    expect(chartPadding(MOBILE_MAX - 1).left).toBe(54);
    expect(chartPadding(MOBILE_MAX).left).toBe(76);
  });
});

describe('the drawn width never exceeds the container', () => {
  // The bug this exists for: a floor of 260 made the SVG 260px wide inside the
  // 198px box this chart actually gets at a 320px viewport, and the wrap's
  // overflow:hidden cropped the right-hand side of the plot.
  it('never returns more than the container reported', () => {
    for (const container of [198, 220, 268, 320, 601, 965]) {
      expect(resolveChartWidth(container), `${container}px`).toBeLessThanOrEqual(container);
    }
  });

  it('draws at exactly the container width once past the floor', () => {
    expect(resolveChartWidth(198)).toBe(198);
    expect(resolveChartWidth(965)).toBe(965);
  });

  it('floors below the narrowest container we really render into', () => {
    // ~198px at a 320px viewport, measured. The floor must sit under it.
    expect(MIN_CHART_WIDTH).toBeLessThan(198);
  });

  it('still guards a zero-width or missing container', () => {
    for (const bad of [0, null, undefined, Number.NaN, -50]) {
      expect(resolveChartWidth(bad as number), String(bad)).toBe(MIN_CHART_WIDTH);
    }
  });

  it('leaves a usable plot even at the floor', () => {
    expect(plotWidth(MIN_CHART_WIDTH)).toBeGreaterThan(0);
  });
});

describe('the first and last points sit inside the plot', () => {
  // A marker centred on the clip edge is half a diamond with half a touch
  // target — and the ends are the two points people look for.
  it('insets by at least half a touch target on mobile', () => {
    expect(chartInset(WIDTHS.tiny)).toBeGreaterThanOrEqual(MIN_TOUCH / 2);
    expect(chartInset(WIDTHS.phone)).toBeGreaterThanOrEqual(MIN_TOUCH / 2);
  });

  it('so a full-size target on the first point clears the axis', () => {
    const pad = chartPadding(WIDTHS.tiny);
    const firstX = pad.left + chartInset(WIDTHS.tiny);
    expect(firstX - MIN_TOUCH / 2).toBeGreaterThanOrEqual(pad.left);
  });

  it('and one on the last point stays inside the right margin', () => {
    const pad = chartPadding(WIDTHS.tiny);
    const lastX = WIDTHS.tiny - pad.right - chartInset(WIDTHS.tiny);
    expect(lastX + MIN_TOUCH / 2).toBeLessThanOrEqual(WIDTHS.tiny - pad.right);
  });
});

describe('compact money on the mobile axis', () => {
  it('reads the way the mockup does', () => {
    expect(compactMoney(15000)).toBe('$15k');
    expect(compactMoney(10000)).toBe('$10k');
    expect(compactMoney(5000)).toBe('$5k');
    expect(compactMoney(0)).toBe('$0');
    expect(compactMoney(-5000)).toBe('−$5k');
    expect(compactMoney(-10000)).toBe('−$10k');
  });

  it('uses a minus sign, not a hyphen', () => {
    expect(compactMoney(-5000).startsWith('−')).toBe(true);
    expect(compactMoney(-5000).includes('-')).toBe(false);
  });

  it('keeps a half-step readable and drops a pointless decimal', () => {
    expect(compactMoney(1500)).toBe('$1.5k');
    expect(compactMoney(2000)).toBe('$2k');
    expect(compactMoney(12500)).toBe('$13k');
  });

  it('does not abbreviate what does not need it', () => {
    expect(compactMoney(750)).toBe('$750');
    expect(compactMoney(-250)).toBe('−$250');
  });

  // Rounding a gridline is a gridline. Rounding a figure somebody acts on is
  // telling them they have money they do not have.
  it('is never used where a real figure belongs', () => {
    expect(fullMoney(9800)).toBe('$9,800');
    expect(axisMoney(9800, WIDTHS.desktop)).toBe('$9,800');
    expect(axisMoney(9800, WIDTHS.tiny)).toBe('$9.8k');
  });
});

describe('x-axis labels', () => {
  it('shows no more than 4 on a phone', () => {
    for (const dayCount of [30, 45, 60, 90, 120]) {
      expect(xAxisTicks(dayCount, WIDTHS.tiny).length, `${dayCount} days`).toBeLessThanOrEqual(4);
      expect(xAxisTicks(dayCount, WIDTHS.phone).length, `${dayCount} days`).toBeLessThanOrEqual(4);
    }
  });

  it('always keeps the first and the last date', () => {
    for (const dayCount of [2, 7, 30, 90]) {
      for (const width of Object.values(WIDTHS)) {
        const ticks = xAxisTicks(dayCount, width);
        expect(ticks[0], `${dayCount}@${width}`).toBe(0);
        expect(ticks[ticks.length - 1], `${dayCount}@${width}`).toBe(dayCount - 1);
      }
    }
  });

  it('never repeats an index or goes backwards', () => {
    for (const dayCount of [2, 3, 5, 30, 90]) {
      const ticks = xAxisTicks(dayCount, WIDTHS.tiny);
      expect(new Set(ticks).size).toBe(ticks.length);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
  });

  it('survives a one-day and an empty forecast', () => {
    expect(xAxisTicks(1, WIDTHS.tiny)).toEqual([0]);
    expect(xAxisTicks(0, WIDTHS.tiny)).toEqual([]);
  });

  it('shows more on a desktop, where there is room', () => {
    expect(xAxisTicks(90, WIDTHS.desktop).length).toBeGreaterThan(xAxisTicks(90, WIDTHS.tiny).length);
  });
});

describe('markers that would overlap become one', () => {
  const xEvery = (gap: number) => (index: number) => index * gap;

  it('leaves well-spaced markers alone', () => {
    const groups = groupMarkers([day(0), day(10), day(20)], xEvery(40));
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it('folds markers closer than a touch target', () => {
    // 12px apart: three of them cannot all be tapped.
    const groups = groupMarkers([day(0), day(1), day(2)], xEvery(12));
    expect(groups).toHaveLength(1);
    expect(groups[0].eventCount).toBe(3);
    expect(groups[0].grouped).toBe(true);
  });

  it('measures from the group anchor, so a run cannot chain across the axis', () => {
    // 31px apart — under the 32px gap, but each hop is measured from the anchor,
    // so the group closes as soon as the anchor is cleared.
    const groups = groupMarkers(Array.from({ length: 8 }, (_, i) => day(i)), xEvery(31));
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) expect(group.days.length).toBeLessThanOrEqual(2);
  });

  it('treats one day with several transactions as grouped', () => {
    const groups = groupMarkers([day(0, 3)], xEvery(40));
    expect(groups).toHaveLength(1);
    expect(groups[0].grouped).toBe(true);
    expect(groups[0].eventCount).toBe(3);
  });

  it('ignores days with nothing on them', () => {
    expect(groupMarkers([day(0, 0), day(5, 0)], xEvery(40))).toEqual([]);
  });

  // The load-bearing property: grouping is a drawing decision, not a data one.
  it('never loses a transaction or a day', () => {
    const days = Array.from({ length: 20 }, (_, i) => day(i, (i % 3) + 1));
    const groups = groupMarkers(days, xEvery(8));
    expect(groups.flatMap((g) => g.days.map((d) => d.index))).toEqual(days.map((d) => d.index));
    expect(groups.reduce((sum, g) => sum + g.eventCount, 0)).toBe(days.reduce((sum, d) => sum + d.events.length, 0));
  });

  it('anchors each group on its first day, which is what selection reports', () => {
    const groups = groupMarkers([day(4), day(5), day(6)], xEvery(10));
    expect(groups[0].index).toBe(4);
  });

  it('at 90 days on a 320px phone, leaves a tappable number of markers', () => {
    const width = WIDTHS.tiny;
    const pad = chartPadding(width);
    const inset = chartInset(width);
    const plot = plotWidth(width);
    const days = Array.from({ length: 90 }, (_, i) => day(i));
    const xFor = (index: number) => pad.left + inset + (index / 89) * plot;
    const groups = groupMarkers(days, xFor);
    // Every remaining marker clears a touch target from its neighbour.
    for (let i = 1; i < groups.length; i += 1) {
      expect(Math.abs(xFor(groups[i].index) - xFor(groups[i - 1].index))).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
    expect(groups.length).toBeLessThan(days.length);
  });
});

describe('finding the group a selection belongs to', () => {
  const groups = groupMarkers([day(0), day(1), day(9)], (index) => index * 12);

  it('finds a folded day by its own index, not just the anchor', () => {
    expect(groupForIndex(groups, 1)?.index).toBe(0);
  });

  it('is null for nothing selected, or a day with no marker', () => {
    expect(groupForIndex(groups, null)).toBeNull();
    expect(groupForIndex(groups, 5)).toBeNull();
  });
});

describe('a floating label stays inside the plot', () => {
  it('opens leftwards when there is room, as it always did', () => {
    expect(flipInside(300, 58, 76, 320)).toEqual({ x: 242, side: 'left' });
  });

  it('flips rather than hanging over the axis', () => {
    const out = flipInside(100, 58, 76, 320);
    expect(out.side).toBe('right');
    expect(out.x).toBeGreaterThanOrEqual(76);
  });

  it('clamps when neither side fits, rather than overflowing', () => {
    const plotLeft = 54;
    const plotRight = 100;
    const out = flipInside(60, 58, plotLeft, plotRight);
    expect(out.x).toBeGreaterThanOrEqual(plotLeft);
    expect(out.x).toBeLessThanOrEqual(plotRight);
  });

  it('never lets the label pass either edge, at any anchor', () => {
    for (let anchor = 54; anchor <= 320; anchor += 7) {
      const out = flipInside(anchor, 58, 54, 320);
      expect(out.x, `anchor ${anchor}`).toBeGreaterThanOrEqual(54);
      expect(out.x + 58, `anchor ${anchor}`).toBeLessThanOrEqual(320 + 0.001);
    }
  });
});
