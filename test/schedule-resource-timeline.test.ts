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
});
