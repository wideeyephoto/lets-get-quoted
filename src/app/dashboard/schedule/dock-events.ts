/**
 * The one message the agenda sends the unscheduled-jobs sheet.
 *
 * The sheet (ScheduleDock) and the calendar are siblings under
 * ScheduleDragProvider, but the provider is about a drag in progress — putting
 * "is the sheet open" in it would make every drag consumer re-render when a
 * button unrelated to dragging is pressed. A window event keeps the two
 * components independent: the agenda asks, and if the sheet is on screen it
 * opens. If there is nothing to schedule the sheet is not rendered at all and
 * the event lands on nobody, which is the correct outcome.
 */
export const OPEN_SCHEDULE_DOCK_EVENT = 'lgq:open-schedule-dock';
