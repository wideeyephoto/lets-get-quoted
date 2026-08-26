import type { TourEventName, TourEventRecord } from './types';

export const ALLOWED_TOUR_EVENTS = new Set<TourEventName>([
  'tour_offered',
  'tour_started',
  'step_viewed',
  'step_completed',
  'step_target_missing',
  'tour_exited',
  'tour_dismissed',
  'tour_completed',
  'tour_restarted',
  'signup_clicked',
  'setup_action_clicked',
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  'email',
  'phone',
  'name',
  'customer_name',
  'client_name',
  'address',
  'password',
  'ssn',
  'ein',
  'credit_card',
  'card_number',
  'cvv',
  'ip',
  'ip_address',
  'token',
  'secret',
]);

const MAX_PAYLOAD_BYTES = 2048;

/**
 * Validates and sanitizes a raw event record payload, stripping any PII and ensuring
 * allowable event types and data sizes.
 */
export function sanitizeTourEventPayload(raw: Record<string, unknown>): {
  valid: boolean;
  sanitized?: TourEventRecord;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Invalid payload structure' };
  }

  const rawJson = JSON.stringify(raw);
  if (rawJson.length > MAX_PAYLOAD_BYTES) {
    return { valid: false, error: 'Payload exceeds maximum allowed size' };
  }

  const eventType = String(raw.event_type ?? '');
  if (!ALLOWED_TOUR_EVENTS.has(eventType as TourEventName)) {
    return { valid: false, error: `Disallowed event type: ${eventType}` };
  }

  const clientEventId = String(raw.client_event_id ?? '').trim();
  if (!clientEventId) {
    return { valid: false, error: 'Missing client_event_id' };
  }

  const tourKey = String(raw.tour_key ?? 'demo-job-lifecycle').trim();
  const tourVersion = typeof raw.tour_version === 'number' ? raw.tour_version : 1;
  const stepId = raw.step_id ? String(raw.step_id).trim() : undefined;
  const anonymousSessionId = raw.anonymous_session_id ? String(raw.anonymous_session_id).trim() : undefined;
  const source = raw.source ? String(raw.source).trim().slice(0, 64) : undefined;
  const pathname = raw.pathname ? String(raw.pathname).split('?')[0].trim().slice(0, 128) : undefined;

  let sanitizedMeta: Record<string, string | number | boolean | null> | undefined;
  if (raw.metadata && typeof raw.metadata === 'object') {
    sanitizedMeta = {};
    for (const [key, value] of Object.entries(raw.metadata as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(lowerKey)) {
        continue; // Strip PII fields
      }
      if (typeof value === 'string') {
        sanitizedMeta[key] = value.slice(0, 120);
      } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        sanitizedMeta[key] = value;
      }
    }
  }

  return {
    valid: true,
    sanitized: {
      client_event_id: clientEventId,
      tour_key: tourKey,
      tour_version: tourVersion,
      event_type: eventType as TourEventName,
      step_id: stepId,
      anonymous_session_id: anonymousSessionId,
      source,
      pathname,
      metadata: sanitizedMeta,
    },
  };
}
