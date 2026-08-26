/**
 * Client telemetry tracker for the 5-minute evaluation demo tour and product tours.
 *
 * Tracks funnel progression safely in sessionStorage and sends non-PII events to
 * the aggregate telemetry endpoint.
 */

export type DemoEventName =
  | 'tour_offered'
  | 'tour_started'
  | 'step_viewed'
  | 'step_interacted'
  | 'step_skipped'
  | 'step_completed'
  | 'action_simulated'
  | 'quote_option_changed'
  | 'signature_applied'
  | 'deposit_simulated'
  | 'cross_device_handoff_opened'
  | 'step_target_missing'
  | 'tour_exited'
  | 'tour_dismissed'
  | 'tour_completed'
  | 'tour_restarted'
  | 'explore_freely'
  | 'signup_clicked'
  | 'cta_clicked'
  | 'setup_action_clicked';

export type DemoEventPayload = {
  step?: number;
  stepSlug?: string;
  stepId?: string;
  tourKey?: string;
  tourVersion?: number;
  perspective?: string;
  source?: string;
  targetId?: string;
  pathname?: string;
  depositAmount?: number;
  totalSteps?: number;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  [key: string]: string | number | boolean | null | undefined;
};

const STORAGE_KEY = 'lgq_demo_tour_events';
const SESSION_ID_KEY = 'lgq_demo_session_id';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = 'ds_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback_session';
  }
}

function resolveDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth || 1200;
  if (width <= 768) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

export function trackDemoEvent(eventName: DemoEventName, payload: DemoEventPayload = {}): void {
  if (typeof window === 'undefined') return;

  try {
    const timestamp = new Date().toISOString();
    const sessionId = getOrCreateSessionId();
    const clientEventId = 'ev_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
    const deviceType = payload.deviceType || resolveDeviceType();

    const eventRecord = {
      client_event_id: clientEventId,
      anonymous_session_id: sessionId,
      event: eventName,
      timestamp,
      device_type: deviceType,
      pathname: window.location.pathname,
      ...payload,
    };

    // Store in sessionStorage for evaluation metrics and tests
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

    // Send to backend telemetry endpoint if online
    const body = JSON.stringify({
      client_event_id: clientEventId,
      anonymous_session_id: sessionId,
      event_type: eventName,
      tour_key: payload.tourKey ?? 'demo-job-lifecycle',
      tour_version: payload.tourVersion ?? 1,
      step_id: payload.stepId ?? (payload.step ? `step-${payload.step}` : undefined),
      source: payload.source ?? 'demo_client',
      pathname: window.location.pathname,
      metadata: {
        perspective: payload.perspective,
        stepSlug: payload.stepSlug,
        targetId: payload.targetId,
        deviceType,
      },
    });

    if (
      navigator &&
      typeof navigator.sendBeacon === 'function' &&
      (eventName === 'tour_exited' ||
        eventName === 'signup_clicked' ||
        eventName === 'tour_completed' ||
        eventName === 'cta_clicked')
    ) {
      navigator.sendBeacon('/api/demo-tour/events', body);
    } else {
      fetch('/api/demo-tour/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Fail silently
      });
    }
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
