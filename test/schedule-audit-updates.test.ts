import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('schedule dashboard audit enhancements', () => {
  it('supports Escape key dismissal and Esc shortcut hints in ScheduleDragProvider', () => {
    const dragProvider = read('src', 'app', 'dashboard', 'schedule', 'ScheduleDragProvider.tsx');
    expect(dragProvider).toContain("if (event.key === 'Escape')");
    expect(dragProvider).toContain('window.addEventListener(\'keydown\', handleKeyDown)');
    expect(dragProvider).toContain('<kbd className="sched-esc-hint">Esc</kbd>');
  });

  it('renders multi-day continuation indicator on timeline job pills', () => {
    const timeline = read('src', 'app', 'dashboard', 'schedule', 'ScheduleTimeline.tsx');
    expect(timeline).toContain('meta.dayCount > 1');
    expect(timeline).toContain('className="sched-tl-job-cont"');
    expect(timeline).toContain('(d{meta.dayIndex + 1}/{meta.dayCount})');
  });

  it('supports touch swipe navigation in mobile agenda', () => {
    const mobileAgenda = read('src', 'app', 'dashboard', 'schedule', 'ScheduleMobileAgenda.tsx');
    expect(mobileAgenda).toContain('onTouchStart={handleTouchStart}');
    expect(mobileAgenda).toContain('onTouchEnd={handleTouchEnd}');
    expect(mobileAgenda).toContain('touchStartRef.current');
  });

  it('provides aria-live polite screen reader announcement on view change', () => {
    const calendar = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
    expect(calendar).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(calendar).toContain('{viewAnnouncement}');
    expect(calendar).toContain('setViewAnnouncement(`Switched to ${opt.label} view: ${opt.hint}`)');
  });

  it('adds contextual tooltips to calendar legend items', () => {
    const legend = read('src', 'app', 'dashboard', 'schedule', 'CalendarLegend.tsx');
    expect(legend).toContain('STATUS_DESCRIPTIONS');
    expect(legend).toContain('CAPACITY_DESCRIPTIONS');
    expect(legend).toContain('title={STATUS_DESCRIPTIONS[status.key]}');
    expect(legend).toContain('title={CAPACITY_DESCRIPTIONS[band.key]}');
  });

  it('displays empty overlay card in ScheduleMap when no pins exist', () => {
    const map = read('src', 'app', 'dashboard', 'schedule', 'ScheduleMap.tsx');
    expect(map).toContain('pins.length === 0');
    expect(map).toContain('schedule-map-empty-overlay');
  });

  it('tracks forecast check timestamp and offers re-check action in WeatherPanel', () => {
    const weather = read('src', 'app', 'dashboard', 'schedule', 'WeatherPanel.tsx');
    expect(weather).toContain('checkedAt?: string');
    expect(weather).toContain('weather-checked-bar');
    expect(weather).toContain('weather-checked-time');
    expect(weather).toContain('Re-check');
  });

  it('includes required CSS rules in globals.css for audit enhancements', () => {
    const css = read('src', 'app', 'globals.css');
    expect(css).toContain('.sched-esc-hint');
    expect(css).toContain('.sched-tl-job-cont');
    expect(css).toContain('.schedule-map-empty-overlay');
    expect(css).toContain('.weather-checked-bar');
  });

  it('keeps unscheduled queue cards in clean 2-column grid with actions stacked under details', () => {
    const css = read('src', 'app', 'globals.css');
    expect(css).toContain('.sched-row {\n  display: grid;\n  grid-template-columns: auto minmax(0, 1fr);');
    expect(css).toContain('.sched-row-go,\n.sched-row-actions {\n  grid-column: 1 / -1;');
  });
});
