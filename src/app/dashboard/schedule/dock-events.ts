/**
 * The one message the rest of the page sends the unscheduled-jobs queue.
 *
 * The queue and the calendar are siblings under ScheduleDragProvider, but the
 * provider is about a drag in progress — putting "is the queue open" in it would
 * make every drag consumer re-render when a button unrelated to dragging is
 * pressed. A window event keeps the two components independent: the banner (or
 * the mobile agenda) asks, and if the queue is on screen it opens. If there is
 * nothing to schedule the queue is not rendered at all and the event lands on
 * nobody, which is the correct outcome.
 */
export const OPEN_SCHEDULE_QUEUE_EVENT = 'lgq:open-schedule-queue';

/** @deprecated Old name, kept so nothing that still imports it breaks silently. */
export const OPEN_SCHEDULE_DOCK_EVENT = OPEN_SCHEDULE_QUEUE_EVENT;
