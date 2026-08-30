import { createAdminClient } from './auth';

/**
 * MUST stay in step with the CHECK constraint on webhook_failures.source.
 *
 * These names are provider-NEUTRAL because the constraint used to name Twilio,
 * which made it the one place a change of SMS provider fails at the database
 * rather than at a comment — and fails invisibly, since logWebhookFailure
 * swallows its own insert error. Writing an unlisted value here does not throw:
 * the failure log just quietly stops logging failures, during the exact window
 * somebody is watching it.
 *
 * 'twilio_inbound' and 'twilio_status' remain because existing rows carry them
 * and the Command Center renders the raw value. Nothing writes them any more.
 * test/sms-provider.test.ts parses the constraint out of schema.sql and checks
 * this union against it.
 */
export type WebhookSource =
  | 'stripe'
  | 'resend'
  | 'sms_inbound'
  | 'sms_status'
  | 'sms_voice'
  | 'ai_voice'
  | 'twilio_inbound'
  | 'twilio_status'
  | 'sms_registry';

export interface WebhookFailureInput {
  source: WebhookSource;
  eventType?: string | null;
  referenceId?: string | null;
  errorMessage: string;
  payloadExcerpt?: string | null;
}

const EXCERPT_MAX = 500;

// In-memory deduplicator / burst dampener to prevent unauthenticated spam floods
// (e.g. signature verification sweeps) from flooding webhook_failures and
// evicting genuine errors from the top admin views.
const recentFailureKeys = new Map<string, { count: number; lastLoggedAt: number }>();
const MAX_TRACKED_KEYS = 500;
const DEDUP_WINDOW_MS = 60_000; // 1 minute
const MAX_LOGS_PER_WINDOW = 5;

function isFlooding(key: string): boolean {
  const now = Date.now();
  if (recentFailureKeys.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of recentFailureKeys.entries()) {
      if (now - v.lastLoggedAt > DEDUP_WINDOW_MS) {
        recentFailureKeys.delete(k);
      }
    }
  }

  const entry = recentFailureKeys.get(key);
  if (!entry || now - entry.lastLoggedAt > DEDUP_WINDOW_MS) {
    recentFailureKeys.set(key, { count: 1, lastLoggedAt: now });
    return false;
  }

  entry.count += 1;
  entry.lastLoggedAt = now;
  return entry.count > MAX_LOGS_PER_WINDOW;
}

// Records a webhook that failed signature verification or threw while
// handling a delivered event. Best-effort by contract, same as
// logAdminAction: a webhook route's job is to acknowledge the provider fast,
// so a failure to LOG a failure must never turn into a second failure that
// makes the route itself throw or hang.
export async function logWebhookFailure(input: WebhookFailureInput): Promise<void> {
  const dedupKey = `${input.source}:${input.eventType ?? ''}:${input.errorMessage.slice(0, 80)}`;
  if (isFlooding(dedupKey)) {
    return;
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('webhook_failures').insert({
      source: input.source,
      event_type: input.eventType ?? null,
      reference_id: input.referenceId ?? null,
      error_message: input.errorMessage,
      payload_excerpt: input.payloadExcerpt ? input.payloadExcerpt.slice(0, EXCERPT_MAX) : null,
    });
    if (error) console.error('logWebhookFailure insert failed:', error);
  } catch (err) {
    console.error('logWebhookFailure threw (non-fatal):', err);
  }
}
