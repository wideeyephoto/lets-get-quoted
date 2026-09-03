import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALENDAR_VIEWS, normalizeCalendarView } from '@/lib/dashboard-views';
import { dispatchJobScheduleAction } from '@/app/dashboard/jobs/actions';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Resource Timeline views registration', () => {
  it('registers resource_timeline and timeline_week in CALENDAR_VIEWS', () => {
    expect(CALENDAR_VIEWS).toContain('resource_timeline');
    expect(CALENDAR_VIEWS).toContain('timeline_week');
  });

  it('normalizes resource_timeline and timeline_week correctly', () => {
    expect(normalizeCalendarView('resource_timeline')).toBe('resource_timeline');
    expect(normalizeCalendarView('timeline_week')).toBe('timeline_week');
  });

  it('declares Timeline and Timeline week in ScheduleCalendar view options', () => {
    const calendarCode = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendarCode).toContain("id: 'resource_timeline'");
    expect(calendarCode).toContain("label: 'Timeline'");
    expect(calendarCode).toContain("id: 'timeline_week'");
    expect(calendarCode).toContain("label: 'Timeline week'");
    expect(calendarCode).toContain("import ScheduleResourceTimeline from './ScheduleResourceTimeline';");
  });

  it('renders ScheduleResourceTimeline for resource_timeline and timeline_week', () => {
    const calendarCode = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendarCode).toContain("effectiveView === 'resource_timeline' || effectiveView === 'timeline_week'");
    expect(calendarCode).toContain('<ScheduleResourceTimeline');
  });

  it('exports dispatchJobScheduleAction server action', () => {
    expect(typeof dispatchJobScheduleAction).toBe('function');
  });

  it('uses theme variables and avoids undefined tokens in ScheduleResourceTimeline.module.css', () => {
    const css = read('src', 'app', 'dashboard', 'schedule', 'ScheduleResourceTimeline.module.css');
    // Ensure legacy broken tokens are gone
    expect(css).not.toContain('--bg-1');
    expect(css).not.toContain('--text-1');
    expect(css).not.toContain('--text-2');
    expect(css).not.toContain('--text-3');
    expect(css).not.toContain('--border-1');
    expect(css).not.toContain('--border-2');

    // Ensure theme design tokens are properly used
    expect(css).toContain('var(--bg-2)');
    expect(css).toContain('var(--bg-3)');
    expect(css).toContain('var(--text)');
    expect(css).toContain('var(--muted)');
    expect(css).toContain('var(--tint)');
  });

  it('uses WCAG compliant contrast colors for all job card variants', () => {
    const css = read('src', 'app', 'dashboard', 'schedule', 'ScheduleResourceTimeline.module.css');
    // Verify high-contrast jewel tone values
    expect(css).toContain('background: #475569'); // cardSlate
    expect(css).toContain('background: #6d28d9'); // cardPurple
    expect(css).toContain('background: #1d4ed8'); // cardBlue
    expect(css).toContain('background: #c2410c'); // cardOrange
    expect(css).toContain('background: #9f1239'); // cardRose
    expect(css).toContain('background: #047857'); // cardEmerald
    expect(css).toContain('background: #b45309'); // cardAmber
  });

  it('renders STATUS_MARK accessibility glyphs in ScheduleResourceTimeline.tsx', () => {
    const tsx = read('src', 'app', 'dashboard', 'schedule', 'ScheduleResourceTimeline.tsx');
    expect(tsx).toContain("import { STATUS_MARK } from './CalendarLegend';");
    expect(tsx).toContain('STATUS_MARK[job.status]');
  });
});
