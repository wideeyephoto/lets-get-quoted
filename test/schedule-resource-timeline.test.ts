import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALENDAR_VIEWS, normalizeCalendarView } from '@/lib/dashboard-views';
import { dispatchJobScheduleAction } from '@/app/dashboard/jobs/actions';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Dispatch and Timeline view consolidation', () => {
  it('registers crew and timeline_week in CALENDAR_VIEWS', () => {
    expect(CALENDAR_VIEWS).toContain('crew');
    expect(CALENDAR_VIEWS).toContain('timeline_week');
  });

  it('normalizes resource_timeline to crew and preserves timeline_week', () => {
    expect(normalizeCalendarView('resource_timeline')).toBe('crew');
    expect(normalizeCalendarView('timeline_week')).toBe('timeline_week');
    expect(normalizeCalendarView('crew')).toBe('crew');
  });

  it('declares Dispatch and Dispatch week in ScheduleCalendar view options', () => {
    const calendarCode = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendarCode).toContain("id: 'crew'");
    expect(calendarCode).toContain("label: 'Dispatch'");
    expect(calendarCode).toContain("id: 'timeline_week'");
    expect(calendarCode).toContain("label: 'Dispatch week'");
  });

  it('keeps the top toolbar quick segmented bar lean with Day, Week, and Capacity', () => {
    const calendarCode = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendarCode).toContain("const QUICK_VIEWS = new Set<CalendarView>(['day', 'week', 'month']);");
  });

  it('renders ScheduleCrewLanes for crew and timeline_week', () => {
    const calendarCode = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendarCode).toContain("effectiveView === 'crew' || effectiveView === 'timeline_week' || effectiveView === 'resource_timeline'");
    expect(calendarCode).toContain('<ScheduleCrewLanes');
  });

  it('exports dispatchJobScheduleAction server action', () => {
    expect(typeof dispatchJobScheduleAction).toBe('function');
  });

  it('equips ScheduleCrewLanes with interactive 2D drag-and-drop dispatch', () => {
    const tsx = read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx');
    expect(tsx).toContain('handleCardPointerDown');
    expect(tsx).toContain('targetLaneId');
    expect(tsx).toContain('snapMinutes');
    expect(tsx).toContain('sched-crew-ghost');
  });

  it('equips ScheduleCrewLanes with right-edge duration resizing', () => {
    const tsx = read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx');
    expect(tsx).toContain('handleResizePointerDown');
    expect(tsx).toContain('sched-crew-resize-handle');
    expect(tsx).toContain('sched-crew-resize-bar');
  });

  it('provides optimistic updates with 1-click Undo toast', () => {
    const tsx = read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx');
    expect(tsx).toContain('sched-crew-undo-toast');
    expect(tsx).toContain('sched-crew-undo-btn');
    expect(tsx).toContain('handleUndo');
  });

  it('provides Day and Week view range switching', () => {
    const tsx = read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx');
    expect(tsx).toContain('sched-crew-mode-toggle');
    expect(tsx).toContain('sched-crew-mode-btn');
  });

  it('contains CSS rules for dispatch interactivity in globals.css', () => {
    const css = read('src', 'app', 'globals.css');
    expect(css).toContain('.sched-crew-lane.target-lane');
    expect(css).toContain('.sched-crew-ghost');
    expect(css).toContain('.sched-crew-resize-handle');
    expect(css).toContain('.sched-crew-floating');
    expect(css).toContain('.sched-crew-undo-toast');
  });
});
