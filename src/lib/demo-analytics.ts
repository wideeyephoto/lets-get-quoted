/**
 * Client telemetry tracker for the 5-minute evaluation demo tour.
 *
 * Tracks funnel progression (tour_started, step_viewed, tour_completed,
 * explore_freely, signup_clicked) safely in sessionStorage without collecting
 * any customer-entered PII.
 */

export type DemoEventName =
  | 'tour_started'
  | 'step_viewed'
  | 'tour_completed'
  | 'explore_freely'
  | 'signup_clicked';

export type DemoEventPayload = {
  step?: number;
  stepSlug?: string;
  perspective?: string;
  source?: string;
  [key: string]: string | number | boolean | undefined;
};

const STORAGE_KEY = 'lgq_demo_tour_events';

export function trackDemoEvent(eventName: DemoEventName, payload: DemoEventPayload = {}): void {
  if (typeof window === 'undefined') return;

  try {
    const timestamp = new Date().toISOString();
    const eventRecord = {
      event: eventName,
      timestamp,
      ...payload,
    };

    // Store in sessionStorage for evaluation metrics
    const existing = sessionStorage.getItem(STORAGE_KEY);
    const events = existing ? JSON.parse(existing) : [];
    events.push(eventRecord);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-50)));

    // Emit custom DOM event for tests or listeners
    window.dispatchEvent(
      new CustomEvent('lgq:demo_event', {
        detail: eventRecord,
      }),
    );
  } catch {
    // Fail silently in restricted sandbox environments
  }
}

export function getDemoSessionEvents(): Array<{ event: string; timestamp: string; [key: string]: unknown }> {
  if (typeof window === 'undefined') return [];
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
