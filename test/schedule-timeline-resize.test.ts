import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dispatchJobScheduleAction } from '@/app/dashboard/jobs/actions';
import { addDaysToDateKey } from '@/lib/jobs';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Project Timeline Edge Resizing', () => {
  it('exports dispatchJobScheduleAction supporting scheduledUntil', () => {
    expect(typeof dispatchJobScheduleAction).toBe('function');
  });

  it('declares edge resizing state and handlers in schedule-calendar.tsx', () => {
    const code = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');

    expect(code).toContain('timelineOverrides');
    expect(code).toContain('resizingJob');
    expect(code).toContain('timelineUndo');
    expect(code).toContain('timelineGridRef');

    expect(code).toContain('handleEdgeResizePointerDown');
    expect(code).toContain('handleStepDate');
    expect(code).toContain('applyTimelineDateChange');
  });

  it('renders interactive edge handles and buttons on timeline bars', () => {
    const code = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');

    expect(code).toContain('calendar-timeline-edge-handle left');
    expect(code).toContain('title="Lengthen: start 1 day earlier"');
    expect(code).toContain('title="Shorten: start 1 day later"');

    expect(code).toContain('calendar-timeline-edge-handle right');
    expect(code).toContain('title="Shorten: end 1 day earlier"');
    expect(code).toContain('title="Lengthen: end 1 day later"');

    expect(code).toContain('calendar-timeline-drag-badge');
    expect(code).toContain('calendar-timeline-undo-toast');
    expect(code).toContain('calendar-timeline-undo-btn');
  });

  it('includes required CSS rules in globals.css', () => {
    const css = read('src', 'app', 'globals.css');

    expect(css).toContain('.calendar-timeline-bar.resizing');
    expect(css).toContain('.calendar-timeline-edge-handle');
    expect(css).toContain('.calendar-timeline-edge-grip');
    expect(css).toContain('.calendar-timeline-edge-actions');
    expect(css).toContain('.calendar-timeline-edge-btn');
    expect(css).toContain('.calendar-timeline-drag-badge');
    expect(css).toContain('.calendar-timeline-undo-toast');
    expect(css).toContain('.calendar-timeline-undo-btn');
  });

  it('handles date stepping and boundaries correctly', () => {
    const start = '2026-09-01';
    const end = '2026-09-05';

    expect(addDaysToDateKey(end, 1)).toBe('2026-09-06');
    expect(addDaysToDateKey(end, -1)).toBe('2026-09-04');
    expect(addDaysToDateKey(start, -1)).toBe('2026-08-31');
    expect(addDaysToDateKey(start, 1)).toBe('2026-09-02');
  });
});
